import crypto from 'node:crypto';
import path from 'node:path';

/**
 * docs/issues → GitHub Issues 단방향 미러의 순수 로직 (파싱·본문 변환·동기화 계획).
 * IO(파일 읽기·GitHub API)는 scripts/sync-github-issues.script.ts.
 * docs/issues/active/2026-10-27-github-issues-mirror.md
 */

export const ISSUES_ROOT_DIR = 'docs/issues';
export const ACTIVE_DIR = `${ISSUES_ROOT_DIR}/active`;
export const RESOLVED_DIR = `${ISSUES_ROOT_DIR}/resolved`;

export const MIRROR_LABEL = 'docs-mirror';
export const REMOVED_LABEL = 'docs:removed';
export const STATUS_LABEL_PREFIX = 'status:';
export const KNOWN_STATUSES = [
  '조사중',
  '진행중',
  '완화',
  '적용',
  '보류',
  '해결',
] as const;

/** GitHub Issue 본문 최대 길이 */
const MAX_BODY_LENGTH = 65536;

const SLUG_MARKER_RE = /<!-- docs-issue: ([a-z0-9.-]+) -->/;
const HASH_MARKER_RE = /<!-- docs-issue-hash: ([0-9a-f]+) -->/;
const STATUS_ROW_RE = /^\|\s*\*\*상태\*\*\s*\|\s*\*\*([^*|]+)\*\*/m;
const TITLE_RE = /^#\s+(.+)$/m;

export type DocState = 'open' | 'closed';

export type IssueDoc = {
  slug: string;
  /** repo root 기준 posix 경로 */
  repoPath: string;
  title: string;
  state: DocState;
  status: string | undefined;
  content: string;
};

export type MirrorIssue = {
  number: number;
  title: string;
  body: string;
  state: DocState;
  labels: string[];
};

export type DesiredIssue = {
  slug: string;
  title: string;
  body: string;
  state: DocState;
  labels: string[];
};

export type SyncAction =
  | { kind: 'create'; desired: DesiredIssue }
  | {
      kind: 'update';
      number: number;
      slug: string;
      changes: Partial<
        Pick<DesiredIssue, 'title' | 'body' | 'state' | 'labels'>
      >;
      stateReason?: 'completed' | 'not_planned' | 'reopened';
    };

export type RepoRef = {
  owner: string;
  repo: string;
  ref: string;
};

export function parseIssueDoc(repoPath: string, content: string): IssueDoc {
  const posixPath = repoPath.split(path.sep).join('/');
  const slug = path.posix.basename(posixPath, '.md');
  const state: DocState = posixPath.startsWith(`${RESOLVED_DIR}/`)
    ? 'closed'
    : 'open';
  const title = content.match(TITLE_RE)?.[1]?.trim() ?? slug;
  const rawStatus = content.match(STATUS_ROW_RE)?.[1]?.trim();
  const status = KNOWN_STATUSES.find(each => each === rawStatus);
  return { slug, repoPath: posixPath, title, state, status, content };
}

function blobUrl(repo: RepoRef, kind: 'blob' | 'tree', target: string) {
  return `https://github.com/${repo.owner}/${repo.repo}/${kind}/${repo.ref}/${target}`;
}

/**
 * 상대 링크를 GitHub blob/tree URL로 바꾼다. 코드 펜스 안은 건드리지 않는다.
 */
export function rewriteRelativeLinks(
  content: string,
  repoPath: string,
  repo: RepoRef,
): string {
  const baseDir = path.posix.dirname(repoPath);
  let inFence = false;
  return content
    .split('\n')
    .map(line => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(
        /(!?\[[^\]]*\]\()([^)\s]+)(\))/g,
        (match, open: string, target: string, close: string) => {
          if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) return match;
          const [targetPath, fragment] = target.split('#', 2);
          const resolved = path.posix.normalize(
            path.posix.join(baseDir, targetPath),
          );
          if (resolved.startsWith('..')) return match;
          const isDir = targetPath.endsWith('/');
          const url = blobUrl(
            repo,
            isDir ? 'tree' : 'blob',
            isDir ? resolved.replace(/\/?$/, '/') : resolved,
          );
          return `${open}${url}${fragment ? `#${fragment}` : ''}${close}`;
        },
      );
    })
    .join('\n');
}

export function hashContent(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function renderIssueBody(doc: IssueDoc, repo: RepoRef): string {
  const withoutTitle = doc.content.replace(TITLE_RE, '').replace(/^\s+/, '');
  const converted = rewriteRelativeLinks(withoutTitle, doc.repoPath, repo);
  const header = [
    `<!-- docs-issue: ${doc.slug} -->`,
    '> [!NOTE]',
    `> SSOT: [\`${doc.repoPath}\`](${blobUrl(repo, 'blob', doc.repoPath)}). 제목·본문·라벨·상태는 md에서 자동 동기화된다. 여기서 고치면 다음 동기화 때 덮어쓴다. 댓글은 자유.`,
    '',
  ].join('\n');

  let main = `${header}\n${converted.trimEnd()}\n`;
  const footerLength = '\n<!-- docs-issue-hash: 0000000000000000 -->'.length;
  if (main.length + footerLength > MAX_BODY_LENGTH) {
    const notice = '\n\n> 본문이 길어 잘렸다. 전체는 SSOT md를 본다.\n';
    main =
      main.slice(0, MAX_BODY_LENGTH - footerLength - notice.length) + notice;
  }
  return `${main}\n<!-- docs-issue-hash: ${hashContent(main)} -->`;
}

export function toDesiredIssue(doc: IssueDoc, repo: RepoRef): DesiredIssue {
  const labels = [MIRROR_LABEL];
  if (doc.status) labels.push(`${STATUS_LABEL_PREFIX}${doc.status}`);
  return {
    slug: doc.slug,
    title: doc.title,
    body: renderIssueBody(doc, repo),
    state: doc.state,
    labels,
  };
}

export function extractSlug(
  body: string | null | undefined,
): string | undefined {
  return body?.match(SLUG_MARKER_RE)?.[1];
}

function extractHash(body: string): string | undefined {
  return body.match(HASH_MARKER_RE)?.[1];
}

/** 마커가 아닌 실제 본문으로 hash를 다시 계산한다. 웹 편집이 마커를 남겨도 잡힌다. */
function actualHash(body: string): string {
  const main = body
    .replace(/\r\n/g, '\n')
    .replace(/\n<!-- docs-issue-hash: [0-9a-f]+ -->\s*$/, '');
  return hashContent(main);
}

function isManagedLabel(label: string): boolean {
  return (
    label === MIRROR_LABEL ||
    label === REMOVED_LABEL ||
    label.startsWith(STATUS_LABEL_PREFIX)
  );
}

/** 사람이 붙인 라벨은 유지하고 미러가 관리하는 라벨만 맞춘다. */
function mergeLabels(current: string[], desiredManaged: string[]): string[] {
  const kept = current.filter(each => !isManagedLabel(each));
  return [...new Set([...desiredManaged, ...kept])].sort();
}

function sameLabels(a: string[], b: string[]): boolean {
  return [...a].sort().join('\n') === [...b].sort().join('\n');
}

/**
 * md 목록과 기존 미러 Issue 목록을 비교해 실행할 동작을 계산한다.
 * 같은 slug의 Issue가 여러 개면 번호가 가장 작은 것만 관리한다.
 */
export function planSync(
  desired: DesiredIssue[],
  existing: MirrorIssue[],
): SyncAction[] {
  const bySlug = new Map<string, MirrorIssue>();
  for (const issue of [...existing].sort((a, b) => a.number - b.number)) {
    const slug = extractSlug(issue.body);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, issue);
  }

  const actions: SyncAction[] = [];
  const seen = new Set<string>();

  for (const want of [...desired].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )) {
    seen.add(want.slug);
    const issue = bySlug.get(want.slug);
    if (!issue) {
      actions.push({ kind: 'create', desired: want });
      continue;
    }

    const changes: Extract<SyncAction, { kind: 'update' }>['changes'] = {};
    if (issue.title !== want.title) changes.title = want.title;
    if (actualHash(issue.body) !== extractHash(want.body)) {
      changes.body = want.body;
    }
    const labels = mergeLabels(issue.labels, want.labels);
    if (!sameLabels(issue.labels, labels)) changes.labels = labels;
    let stateReason: 'completed' | 'reopened' | undefined;
    if (issue.state !== want.state) {
      changes.state = want.state;
      stateReason = want.state === 'closed' ? 'completed' : 'reopened';
    }
    if (Object.keys(changes).length > 0) {
      actions.push({
        kind: 'update',
        number: issue.number,
        slug: want.slug,
        changes,
        stateReason,
      });
    }
  }

  for (const [slug, issue] of bySlug) {
    if (seen.has(slug)) continue;
    const labels = mergeLabels(issue.labels, [MIRROR_LABEL, REMOVED_LABEL]);
    const changes: Extract<SyncAction, { kind: 'update' }>['changes'] = {};
    if (!sameLabels(issue.labels, labels)) changes.labels = labels;
    if (issue.state !== 'closed') changes.state = 'closed';
    if (Object.keys(changes).length > 0) {
      actions.push({
        kind: 'update',
        number: issue.number,
        slug,
        changes,
        stateReason: changes.state ? 'not_planned' : undefined,
      });
    }
  }

  return actions;
}

export function describeAction(action: SyncAction): string {
  if (action.kind === 'create') {
    return `create  ${action.desired.slug} (${action.desired.state})`;
  }
  const fields = Object.keys(action.changes).join(',');
  const state = action.changes.state
    ? ` → ${action.changes.state}${action.stateReason ? `/${action.stateReason}` : ''}`
    : '';
  return `update  #${action.number} ${action.slug} [${fields}]${state}`;
}
