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
 * develop PR만 auto-merge 를 켠다. 체크가 끝나면 GitHub가 merge commit 으로 넣는다.
 * develop→main (`--base main`) 은 켜지 않는다.
 */
function enableDevelopAutoMerge(prUrl: string): void {
  const enabled = execFileSync(
    'gh',
    [
      'pr',
      'view',
      prUrl,
      '--json',
      'autoMergeRequest',
      '--jq',
      '.autoMergeRequest != null',
    ],
    { encoding: 'utf-8' },
  ).trim();
  if (enabled === 'true') {
    console.log(chalk.green(`auto-merge 이미 켜짐: ${prUrl}`));
    return;
  }

  console.log(chalk.blue(`gh pr merge --merge --auto ${prUrl}`));
  execFileSync('gh', ['pr', 'merge', prUrl, '--merge', '--auto'], {
    stdio: 'inherit',
  });
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
  const output = execFileSync('gh', args, {
    encoding: 'utf-8',
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
  if (base !== 'develop') {
    return;
  }

  const prUrl = output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('https://'))
    .at(-1);
  if (!prUrl) {
    throw new Error('gh pr create 출력에서 PR URL을 찾지 못했습니다.');
  }
  enableDevelopAutoMerge(prUrl);
}

try {
  createGithubPullRequest();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`[오류] ${message}`));
  process.exit(1);
}
