import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import chalk from 'chalk';
import * as src from '../src';
import {
  ACTIVE_DIR,
  describeAction,
  DesiredIssue,
  KNOWN_STATUSES,
  MIRROR_LABEL,
  MirrorIssue,
  parseIssueDoc,
  planSync,
  RepoRef,
  RESOLVED_DIR,
  STATUS_LABEL_PREFIX,
  SyncAction,
  toDesiredIssue,
} from './common/docs-issue-mirror';

/**
 * docs/issues/{active,resolved} → GitHub Issues 단방향 미러.
 * 기본은 dry-run(계획만 출력). `--apply`로 반영. `--ref <branch>`로 링크 기준 브랜치 지정.
 * md가 양쪽에서 사라지면 Issue를 삭제한다 (admin 토큰 필요 — CI는 WORKFLOW_TOKEN).
 * docs/issues/resolved/2026-10-27-github-issues-mirror.md
 */

const API = 'https://api.github.com';
const GRAPHQL = `${API}/graphql`;
/** 콘텐츠 생성 secondary rate limit 회피용 간격 */
const MUTATION_INTERVAL_MS = 1000;
/** 예전 tombstone 라벨. 새 싱크는 쓰지 않고, 남아 있으면 지운다. */
const LEGACY_REMOVED_LABEL = 'docs:removed';

type GithubIssueResponse = {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  node_id: string;
  labels: Array<{ name?: string } | string>;
  pull_request?: unknown;
};

function parseArgs(argv: string[]) {
  const refIndex = argv.indexOf('--ref');
  return {
    apply: argv.includes('--apply'),
    ref:
      refIndex >= 0 && argv[refIndex + 1]
        ? argv[refIndex + 1]
        : src.constants.branches.develop,
  };
}

function resolveRepo(ref: string): RepoRef {
  const [owner, repo] = (
    process.env.GITHUB_REPOSITORY ??
    `${src.constants.author.name}/${src.constants.project.name}`
  ).split('/');
  return { owner, repo, ref };
}

function resolveToken(): string {
  const fromEnv = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    return execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new Error('GitHub 토큰 없음. GH_TOKEN 설정 또는 gh auth login 필요');
  }
}

function createClient(token: string, repo: RepoRef) {
  const base = `${API}/repos/${repo.owner}/${repo.repo}`;

  async function request<T>(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<{ data: T; next: string | undefined }> {
    const response = await fetch(
      url.startsWith('http') ? url : `${base}${url}`,
      {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    if (!response.ok) {
      // 응답 본문만 남긴다. 요청 헤더(토큰)는 로그에 쓰지 않는다.
      throw new Error(
        `GitHub API ${method} ${url} → ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }
    const next = response.headers
      .get('link')
      ?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    const data = (
      response.status === 204 ? undefined : await response.json()
    ) as T;
    return { data, next };
  }

  async function paginate<T>(url: string): Promise<T[]> {
    const result: T[] = [];
    let current: string | undefined = url;
    while (current) {
      const page: { data: T[]; next: string | undefined } = await request<T[]>(
        'GET',
        current,
      );
      result.push(...page.data);
      current = page.next;
    }
    return result;
  }

  async function graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(GRAPHQL, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new Error(
        `GitHub GraphQL → ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }
    const payload = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (payload.errors?.length) {
      throw new Error(
        `GitHub GraphQL: ${payload.errors.map(each => each.message).join('; ')}`,
      );
    }
    if (!payload.data) {
      throw new Error('GitHub GraphQL: empty data');
    }
    return payload.data;
  }

  return { request, paginate, graphql };
}

function readDocs(repo: RepoRef): DesiredIssue[] {
  return [ACTIVE_DIR, RESOLVED_DIR].flatMap(dir => {
    const absoluteDir = path.join(process.cwd(), dir);
    if (!fs.existsSync(absoluteDir)) return [];
    return fs
      .readdirSync(absoluteDir)
      .filter(name => name.endsWith('.md'))
      .map(name =>
        toDesiredIssue(
          parseIssueDoc(
            `${dir}/${name}`,
            fs.readFileSync(path.join(absoluteDir, name), 'utf-8'),
          ),
          repo,
        ),
      );
  });
}

function toMirrorIssue(issue: GithubIssueResponse): MirrorIssue {
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
    state: issue.state,
    labels: issue.labels
      .map(each => (typeof each === 'string' ? each : (each.name ?? '')))
      .filter(Boolean),
  };
}

const LABEL_SPECS: Record<string, { color: string; description: string }> = {
  [MIRROR_LABEL]: {
    color: '5319e7',
    description: 'docs/issues 미러. 수정은 md에서',
  },
  ...Object.fromEntries(
    KNOWN_STATUSES.map(status => [
      `${STATUS_LABEL_PREFIX}${status}`,
      { color: 'c5def5', description: `이슈 문서 상태: ${status}` },
    ]),
  ),
};

async function main(): Promise<void> {
  const { apply, ref } = parseArgs(process.argv.slice(2));
  const repo = resolveRepo(ref);
  const client = createClient(resolveToken(), repo);

  const desired = readDocs(repo);
  const existingRaw = (
    await client.paginate<GithubIssueResponse>(
      `/issues?labels=${encodeURIComponent(MIRROR_LABEL)}&state=all&per_page=100`,
    )
  ).filter(issue => !issue.pull_request);
  const existing = existingRaw.map(toMirrorIssue);
  const nodeIdByNumber = new Map(
    existingRaw.map(issue => [issue.number, issue.node_id]),
  );

  const actions = planSync(desired, existing);
  console.log(
    chalk.blue(
      `${repo.owner}/${repo.repo} · md ${desired.length}개 · 미러 Issue ${existing.length}개 · 동작 ${actions.length}개 (링크 기준 ${ref})`,
    ),
  );
  for (const action of actions) console.log(`  ${describeAction(action)}`);

  if (!apply) {
    console.log(chalk.yellow('dry-run. 반영하려면 --apply'));
    return;
  }

  const existingLabels = new Set(
    (await client.paginate<{ name: string }>('/labels?per_page=100')).map(
      each => each.name,
    ),
  );
  for (const [name, spec] of Object.entries(LABEL_SPECS)) {
    if (existingLabels.has(name)) continue;
    await client.request('POST', '/labels', { name, ...spec });
    console.log(chalk.gray(`  label 생성: ${name}`));
  }
  if (existingLabels.has(LEGACY_REMOVED_LABEL)) {
    await client.request(
      'DELETE',
      `/labels/${encodeURIComponent(LEGACY_REMOVED_LABEL)}`,
    );
    console.log(chalk.gray(`  label 삭제: ${LEGACY_REMOVED_LABEL}`));
  }

  for (const action of actions) {
    await applyAction(client, action, nodeIdByNumber);
    console.log(chalk.green(`  ✓ ${describeAction(action)}`));
    await sleep(MUTATION_INTERVAL_MS);
  }
}

async function applyAction(
  client: ReturnType<typeof createClient>,
  action: SyncAction,
  nodeIdByNumber: Map<number, string>,
): Promise<void> {
  if (action.kind === 'create') {
    const { desired } = action;
    const { data } = await client.request<{ number: number }>(
      'POST',
      '/issues',
      {
        title: desired.title,
        body: desired.body,
        labels: desired.labels,
      },
    );
    if (desired.state === 'closed') {
      await client.request('PATCH', `/issues/${data.number}`, {
        state: 'closed',
        state_reason: 'completed',
      });
    }
    return;
  }

  if (action.kind === 'delete') {
    const issueId = nodeIdByNumber.get(action.number);
    if (!issueId) {
      throw new Error(`node_id 없음: #${action.number} ${action.slug}`);
    }
    await client.graphql<{ deleteIssue: { clientMutationId: string | null } }>(
      `mutation($issueId: ID!) {
        deleteIssue(input: { issueId: $issueId }) {
          clientMutationId
        }
      }`,
      { issueId },
    );
    return;
  }

  const { title, body, labels, state } = action.changes;
  await client.request('PATCH', `/issues/${action.number}`, {
    ...(title !== undefined ? { title } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(labels !== undefined ? { labels } : {}),
    ...(state !== undefined ? { state, state_reason: action.stateReason } : {}),
  });
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`[오류] ${message}`));
  process.exit(1);
});
