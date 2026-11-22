import { execFileSync } from 'node:child_process';
import chalk from 'chalk';
import * as src from '../src';
import { formatKstDate, getGitOutput } from './common';

/**
 * develop → main 승격 PR을 연다 (head=develop).
 *
 * - title·body는 AI 없이 `origin/main..origin/develop` 커밋 목록으로 만든다.
 *   `.github/generated/`는 feature PR용이라 남은 파일을 재사용하지 않는다.
 * - 머지는 `auto-merge` 워크플로가 필수 체크 통과 뒤 merge commit 으로 한다.
 * - 머지 후 head(develop) 자동 삭제는 repo ruleset(deletion)이 막는다.
 */
function promoteDevelopToMain(): void {
  const { main, develop } = src.constants.branches;
  getGitOutput(`git fetch origin ${develop} ${main}`);

  const range = `origin/${main}..origin/${develop}`;
  const ahead = getGitOutput(`git rev-list --count ${range}`);
  if (!ahead || ahead === '0') {
    console.log(
      chalk.yellow(`origin/${develop} 에 main 보다 앞선 커밋이 없습니다.`),
    );
    return;
  }

  const existing = getGitOutput(
    `gh pr list --base ${main} --head ${develop} --state open --json url --jq ".[0].url // empty"`,
  );
  if (existing) {
    console.log(chalk.yellow(`이미 열린 승격 PR: ${existing}`));
    return;
  }

  const commits = getGitOutput(
    `git log --no-merges --format="- %s (%h)" ${range}`,
  );
  const shortSha = getGitOutput(`git rev-parse --short origin/${develop}`);
  const title = `chore: develop → main 승격 (${formatKstDate(new Date())})`;
  const body = [
    '## Summary',
    '',
    `- \`${develop}\` (\`${shortSha}\`) 를 \`${main}\` 으로 승격합니다. 커밋 ${ahead}개.`,
    '',
    '## Commits',
    '',
    commits || '- (merge commit 만 있음)',
    '',
    '## Deployment notes',
    '',
    '- 필수 체크 통과 뒤 `auto-merge` 워크플로가 merge commit 으로 머지합니다.',
    '',
  ].join('\n');

  console.log(chalk.blue(`gh pr create --base ${main} --head ${develop}`));
  const output = execFileSync(
    'gh',
    [
      'pr',
      'create',
      '--base',
      main,
      '--head',
      develop,
      '--title',
      title,
      '--body',
      body,
      '--assignee',
      '@me',
    ],
    { encoding: 'utf-8', stdio: ['inherit', 'pipe', 'inherit'] },
  );
  process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
}

try {
  promoteDevelopToMain();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`[오류] ${message}`));
  process.exit(1);
}
