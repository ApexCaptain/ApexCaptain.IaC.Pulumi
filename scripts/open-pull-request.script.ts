import { execSync } from 'node:child_process';
import fs from 'node:fs';
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

const PROTECTED_BRANCHES = new Set(['main', 'develop']);
const BRANCH_NAME_PATTERN =
  /^(feat|fix|chore|docs|test|dev)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

function run(command: string): void {
  execSync(command, { stdio: 'inherit' });
}

function normalizeBranchName(raw: string): string {
  const line = cleanMarkdownCodeFence(raw)
    .split('\n')
    .map(part => part.trim())
    .find(Boolean);
  if (!line) {
    throw new Error('브랜치 이름이 비어 있습니다.');
  }
  const cleaned = line
    .replace(/^[`'"\s]+|[`'"\s]+$/g, '')
    .replace(/^Branch:\s*/i, '');
  if (!BRANCH_NAME_PATTERN.test(cleaned)) {
    throw new Error(
      `브랜치 이름 형식 오류: "${cleaned}" (예: chore/gitflow-automation)`,
    );
  }
  return cleaned;
}

async function suggestBranchName(): Promise<string> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    throw new Error('CURSOR_API_KEY 환경변수가 없습니다.');
  }

  const modelId =
    process.env.CURSOR_GENERATE_BRANCH_NAME_AI_MODEL ||
    process.env.CURSOR_GENERATE_PULL_REQUEST_AI_MODEL;
  if (!modelId) {
    throw new Error(
      'CURSOR_GENERATE_BRANCH_NAME_AI_MODEL 또는 CURSOR_GENERATE_PULL_REQUEST_AI_MODEL 이 필요합니다.',
    );
  }

  const gitStatus = getGitOutput('git status --porcelain');
  const recentLogs = getGitOutput('git log -5 --oneline');
  const diff = getGitOutput('git diff HEAD') || getGitOutput('git diff');
  const commitsAhead = getGitOutput('git log origin/develop..HEAD --oneline');
  checkSecretLeak(gitStatus, diff);

  const rulesContent = loadGenerationRules('branch-name');
  const prompt = dedent`
    아래 변경을 보고 Git feature 브랜치 이름 하나만 제안하세요.

    [지침]
    ${rulesContent}

    [최근 커밋]
    ${recentLogs || '(없음)'}

    [origin/develop 대비 커밋]
    ${commitsAhead || '(없음)'}

    [작업 트리]
    ${gitStatus || '(깨끗함)'}

    [Diff 요약]
    ${diff.slice(0, 8000) || '(diff 없음)'}
  `;

  console.log(chalk.blue(`Cursor SDK(${modelId})로 브랜치 이름 생성 중...`));

  const result = await Agent.prompt(prompt, {
    apiKey,
    model: { id: modelId },
  });

  if (result.status !== 'finished' || !result.result) {
    throw new Error(`브랜치 이름 생성 실패 (상태: ${result.status})`);
  }

  const name = normalizeBranchName(result.result);
  const outFile = src.constants.paths.files.githubGeneratedBranchNameFile;
  const outDir = src.constants.paths.dirs.githubGeneratedDir;
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(outFile, `${name}\n`, 'utf-8');
  console.log(chalk.green(`✓ 브랜치 이름: ${name} (${outFile})`));
  return name;
}

/**
 * feature 브랜치 보장 → push → PR 본문 생성 → develop 대상 PR 생성.
 * 인자/FEATURE_BRANCH_NAME 이 있으면 AI 브랜치명보다 우선.
 */
async function openPullRequest(): Promise<void> {
  getGitOutput('git fetch origin develop');

  let branch = getGitOutput('git rev-parse --abbrev-ref HEAD');
  const override =
    process.argv[2] ||
    process.env.FEATURE_BRANCH_NAME ||
    process.env.BRANCH_NAME;

  if (PROTECTED_BRANCHES.has(branch)) {
    const name = override
      ? normalizeBranchName(override)
      : await suggestBranchName();
    console.log(chalk.cyan(`보호 브랜치(${branch}) → ${name} 생성`));
    run(`git switch -c ${name}`);
    // 로컬 보호 브랜치 tip을 원격에 맞춰 되돌려, 커밋이 feature에만 남게 함
    const remoteTip = getGitOutput(`git rev-parse --verify origin/${branch}`);
    if (remoteTip) {
      run(`git branch -f ${branch} origin/${branch}`);
    }
    branch = name;
  } else if (override) {
    const name = normalizeBranchName(override);
    if (name !== branch) {
      console.log(
        chalk.yellow(
          `이미 feature 브랜치(${branch})에 있습니다. 지정 이름(${name})은 무시합니다.`,
        ),
      );
    }
  }

  const ahead = getGitOutput('git rev-list --count origin/develop..HEAD');
  if (!ahead || ahead === '0') {
    console.error(
      chalk.red(
        '[오류] origin/develop 대비 푸시할 커밋이 없습니다. 먼저 커밋하세요.',
      ),
    );
    process.exit(1);
  }

  console.log(chalk.blue(`push: ${branch} → origin`));
  run('git push -u origin HEAD');

  console.log(chalk.blue('PR Title/Body 생성 (base: origin/develop)'));
  run('pnpm script:generatePullRequest origin/develop');

  console.log(chalk.blue('gh pr create --base develop'));
  run('pnpm git:pr');
}

void openPullRequest().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`[오류] ${message}`));
  process.exit(1);
});
