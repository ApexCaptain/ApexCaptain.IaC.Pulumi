import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Agent } from '@cursor/sdk';
import chalk from 'chalk';
import dedent from 'dedent';
import * as src from '../src';
import {
  checkSecretLeak,
  cleanMarkdownCodeFence,
  getGitOutput,
  loadGenerationRules,
} from './common';

/**
 * PR 비교 기준(Base)이 되는 브랜치를 결정합니다.
 * 1. CLI 인자(argv[2]) 또는 환경변수(PR_BASE_BRANCH)
 * 2. 통합 브랜치 develop 우선, 없으면 main (이 레포 gitflow)
 */
function determineBaseBranch(): string {
  const customBase = process.argv[2] || process.env.PR_BASE_BRANCH;
  if (customBase) return customBase;

  const hasOriginDevelop = getGitOutput(
    'git rev-parse --verify origin/develop',
  );
  if (hasOriginDevelop) return 'origin/develop';

  const hasDevelop = getGitOutput('git rev-parse --verify develop');
  if (hasDevelop) return 'develop';

  const hasOriginMain = getGitOutput('git rev-parse --verify origin/main');
  if (hasOriginMain) return 'origin/main';

  const hasMain = getGitOutput('git rev-parse --verify main');
  if (hasMain) return 'main';

  return 'develop';
}

interface GithubLabel {
  name: string;
  description?: string;
}

function listGithubLabels(): GithubLabel[] {
  try {
    const raw = execSync('gh label list --json name,description --limit 100', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(raw) as GithubLabel[];
    return parsed.filter(
      label => typeof label?.name === 'string' && label.name,
    );
  } catch {
    console.warn(
      chalk.yellow(
        '[알림] GitHub 라벨 목록 조회 실패. labels 없이 진행합니다.',
      ),
    );
    return [];
  }
}

function normalizeLabels(raw: unknown, allowed: Set<string>): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  const unique: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') {
      continue;
    }
    const name = item.trim();
    if (!name || !allowed.has(name) || unique.includes(name)) {
      continue;
    }
    unique.push(name);
  }
  return unique;
}

/**
 * Base 브랜치 대비 현재 브랜치의 전체 변경 사항을 검토하고,
 * scripts/prompts/ 규칙 및 PR 템플릿을 로드하여 Cursor SDK로 PR Title/Body/Labels를 생성한 뒤 파일로 저장합니다.
 */
async function generatePullRequest(): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error(
      chalk.red('[오류] CURSOR_API_KEY 환경변수가 설정되어 있지 않습니다.'),
    );
    process.exit(1);
  }

  const modelId = process.env.CURSOR_GENERATE_PULL_REQUEST_AI_MODEL;
  if (!modelId) {
    console.error(
      chalk.red(
        '[오류] CURSOR_GENERATE_PULL_REQUEST_AI_MODEL 환경변수가 설정되어 있지 않습니다.',
      ),
    );
    process.exit(1);
  }

  // 1. Base 브랜치 결정 및 PR 대상 커밋/Diff 조회
  const baseBranch = determineBaseBranch();
  console.log(chalk.gray(`PR Base 브랜치: ${baseBranch}`));

  const prCommits = getGitOutput(`git log ${baseBranch}..HEAD --oneline`);
  const prDiff = getGitOutput(`git diff ${baseBranch}...HEAD`);
  const gitStatus = getGitOutput('git status --porcelain');

  if (!prCommits && !prDiff && !gitStatus) {
    console.log(
      chalk.yellow(`Base 브랜치(${baseBranch}) 대비 변경 사항이 없습니다.`),
    );
    return;
  }

  // 2. 보안 가드레일: Diff 및 작업 트리 내 민감 정보 누출 여부 검사
  checkSecretLeak(gitStatus, prDiff);

  // 3. 공통·PR 전용 프롬프트 규칙 및 템플릿 로드
  const rulesContent = loadGenerationRules('pull-request');

  const templatePath = path.join(
    process.cwd(),
    '.github/pull_request_template.md',
  );
  const templateContent = fs.existsSync(templatePath)
    ? fs.readFileSync(templatePath, 'utf-8')
    : '';

  const availableLabels = listGithubLabels();
  const availableLabelsText = availableLabels.length
    ? availableLabels
        .map(
          label =>
            `- ${label.name}${label.description ? `: ${label.description}` : ''}`,
        )
        .join('\n')
    : '(조회 실패 또는 없음. labels는 [])';

  // 4. 프롬프트 구성
  const prompt = dedent`
    당신은 숙련된 소프트웨어 엔지니어로서 아래 전달된 지침 문서와 템플릿에 따라 GitHub PR 제목(Title)과 본문(Body), Labels를 작성해야 합니다.

    [지침 및 규칙]
    ${rulesContent}

    [PR 템플릿 참조]
    ${templateContent}

    [사용 가능한 GitHub Labels]
    ${availableLabelsText}

    [브랜치 커밋 목록 (${baseBranch}..HEAD)]
    ${prCommits || '(커밋 없음, 작업 트리 변경사항 참조)'}

    [작업 트리 상태]
    ${gitStatus || '(깨끗함)'}

    [PR 전체 Diff]
    ${(prDiff || getGitOutput('git diff HEAD')).slice(0, 10000)}
  `;

  console.log(
    chalk.blue(
      `Cursor SDK(${modelId})를 통해 PR Title, Body, Labels를 생성하는 중...`,
    ),
  );

  try {
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: modelId },
    });

    if (result.status !== 'finished' || !result.result) {
      console.error(
        chalk.red(`[오류] PR 정보 생성 실패 (상태: ${result.status})`),
      );
      process.exit(1);
    }

    const rawOutput = cleanMarkdownCodeFence(result.result, 'json');

    // 5. JSON 파싱 및 Fallback 처리
    let parsed: { title: string; body: string; labels?: unknown };
    try {
      parsed = JSON.parse(rawOutput);
    } catch {
      console.warn(chalk.yellow('[알림] JSON 파싱 실패, 텍스트 분리 시도'));
      const firstLineBreak = rawOutput.indexOf('\n');
      if (firstLineBreak > 0) {
        parsed = {
          title: rawOutput.slice(0, firstLineBreak).trim(),
          body: rawOutput.slice(firstLineBreak).trim(),
        };
      } else {
        parsed = {
          title: rawOutput,
          body: rawOutput,
        };
      }
    }

    const allowedLabelNames = new Set(availableLabels.map(label => label.name));
    const labels = normalizeLabels(parsed.labels, allowedLabelNames);

    // 6. 결과 파일 분리 저장 (.github/generated/pull-request-title.txt & pull-request-body.md)
    const titleFile =
      src.constants.paths.files.githubGeneratedPullRequestTitleFile;
    const bodyFile =
      src.constants.paths.files.githubGeneratedPullRequestBodyFile;
    const labelsFile =
      src.constants.paths.files.githubGeneratedPullRequestLabelsFile;
    const outputDir = src.constants.paths.dirs.githubGeneratedDir;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(titleFile, `${parsed.title.trim()}\n`, 'utf-8');
    fs.writeFileSync(bodyFile, `${parsed.body.trim()}\n`, 'utf-8');
    fs.writeFileSync(
      labelsFile,
      labels.length ? `${labels.join('\n')}\n` : '',
      'utf-8',
    );

    console.log(
      chalk.green(`\n✓ PR Title, Body, Labels가 성공적으로 생성되었습니다:`),
    );
    console.log(chalk.green(`  - Title: ${titleFile}`));
    console.log(chalk.green(`  - Body:  ${bodyFile}`));
    console.log(chalk.green(`  - Labels: ${labelsFile}\n`));

    console.log(
      chalk.cyan('-------------------- [PR Title] --------------------'),
    );
    console.log(parsed.title.trim());
    console.log(
      chalk.cyan('--------------------- [PR Body] --------------------'),
    );
    console.log(parsed.body.trim());
    console.log(
      chalk.cyan('-------------------- [PR Labels] -------------------'),
    );
    console.log(labels.length ? labels.join(', ') : '(없음)');
    console.log(
      chalk.cyan('----------------------------------------------------\n'),
    );
  } catch (error: any) {
    console.error(
      chalk.red(
        `[오류] Cursor SDK 호출 중 오류 발생: ${error.message || error}`,
      ),
    );
    process.exit(1);
  }
}

void generatePullRequest();
