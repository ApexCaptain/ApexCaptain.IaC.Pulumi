import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { getGitOutput } from './common';

function run(command: string): void {
  execSync(command, { stdio: 'inherit' });
}

/**
 * develop → main 동기화 PR을 생성합니다.
 * (head=develop 삭제는 repo ruleset이 막음. delete_branch_on_merge 와 무관하게 develop 유지)
 */
async function promoteDevelopToMain(): Promise<void> {
  getGitOutput('git fetch origin develop main');

  const ahead = getGitOutput(
    'git rev-list --count origin/main..origin/develop',
  );
  if (!ahead || ahead === '0') {
    console.log(
      chalk.yellow(
        'origin/develop 이 origin/main 과 같거나 뒤입니다. PR 불필요.',
      ),
    );
    return;
  }

  const existing = getGitOutput(
    'gh pr list --base main --head develop --state open --json number --jq ".[0].number"',
  );
  if (existing) {
    console.log(chalk.yellow(`이미 열린 develop→main PR 있음: #${existing}`));
    run(`gh pr view ${existing} --web`);
    return;
  }

  console.log(
    chalk.blue('PR Title/Body 생성 (base: origin/main, head: develop)'),
  );
  // generate from develop tip: checkout tip via worktree-less compare by setting HEAD temporarily is hard;
  // run generate against current branch if on develop, else use gh after generating from fetched refs.
  const current = getGitOutput('git rev-parse --abbrev-ref HEAD');
  if (current !== 'develop') {
    run('git switch develop');
    run('git pull origin develop');
  } else {
    run('git pull origin develop');
  }

  run('pnpm script:generatePullRequest origin/main');
  console.log(chalk.blue('gh pr create --base main --head develop'));
  run('pnpm git:pr:to-main');
  console.log(
    chalk.green(
      '✓ develop→main PR 생성. 머지 시 develop 삭제는 ruleset이 막습니다.',
    ),
  );
}

void promoteDevelopToMain().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`[오류] ${message}`));
  process.exit(1);
});
