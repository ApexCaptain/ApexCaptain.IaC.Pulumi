import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import chalk from 'chalk';
import * as src from '../src';

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function readGeneratedFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`생성 파일이 없습니다: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8').trim();
}

function readLabels(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

/**
 * `generate-pull-request` 스킬이 만든 title/body/labels 파일로 `gh pr create`를 실행한다.
 * head 가 develop·main 이 아니면 먼저 `git push -u origin <head>` 한다.
 * 머지는 `auto-merge` 워크플로가 필수 체크 통과 뒤 한다.
 */
function createGithubPullRequest(): void {
  const base = readFlag('--base') || 'develop';
  const head =
    readFlag('--head') ||
    execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf-8',
    }).trim();
  if (head === base) {
    throw new Error(`head 와 base 가 같습니다: ${head}`);
  }
  const titleFile =
    src.constants.paths.files.githubGeneratedPullRequestTitleFile;
  const bodyFile = src.constants.paths.files.githubGeneratedPullRequestBodyFile;
  const labelsFile =
    src.constants.paths.files.githubGeneratedPullRequestLabelsFile;

  const title = readGeneratedFile(titleFile);
  if (!title) {
    throw new Error(`PR title이 비어 있습니다: ${titleFile}`);
  }
  readGeneratedFile(bodyFile);

  const labels = readLabels(labelsFile);

  const protectedBranches = Object.values(src.constants.branches);
  if (!protectedBranches.includes(head)) {
    console.log(chalk.blue(`git push -u origin ${head}`));
    execFileSync('git', ['push', '-u', 'origin', head], { stdio: 'inherit' });
  }

  const args = [
    'pr',
    'create',
    '--base',
    base,
    '--title',
    title,
    '--body-file',
    bodyFile,
    // gh 인증 사용자를 Assignee 로
    '--assignee',
    '@me',
    '--head',
    head,
  ];
  for (const label of labels) {
    args.push('--label', label);
  }

  console.log(
    chalk.blue(
      `gh pr create --base ${base} --head ${head} --assignee @me${
        labels.length ? ` --label ${labels.join(',')}` : ''
      }`,
    ),
  );
  const output = execFileSync('gh', args, {
    encoding: 'utf-8',
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
}

try {
  createGithubPullRequest();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`[오류] ${message}`));
  process.exit(1);
}
