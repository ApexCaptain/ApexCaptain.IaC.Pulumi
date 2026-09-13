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
 * `generatePullRequest`가 만든 title/body/labels 파일로 `gh pr create`를 실행한다.
 */
function createGithubPullRequest(): void {
  const base = readFlag('--base') || 'develop';
  const head = readFlag('--head');
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
  const args = [
    'pr',
    'create',
    '--base',
    base,
    '--title',
    title,
    '--body-file',
    bodyFile,
  ];
  if (head) {
    args.push('--head', head);
  }
  for (const label of labels) {
    args.push('--label', label);
  }

  console.log(
    chalk.blue(
      `gh pr create --base ${base}${head ? ` --head ${head}` : ''}${
        labels.length ? ` --label ${labels.join(',')}` : ''
      }`,
    ),
  );
  execFileSync('gh', args, { stdio: 'inherit' });
}

try {
  createGithubPullRequest();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`[오류] ${message}`));
  process.exit(1);
}
