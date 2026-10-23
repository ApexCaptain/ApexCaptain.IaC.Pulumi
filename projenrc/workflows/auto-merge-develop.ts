import { typescript } from 'projen';
import { GithubWorkflow } from 'projen/lib/github';
import { JobPermission } from 'projen/lib/github/workflows-model';
import * as src from '../../src';

/**
 * develop PR에 auto-merge를 켠다. Validate가 통과하면 GitHub가 merge commit으로 넣는다.
 * develop→main 은 대상이 아니다.
 *
 * `pull_request_target`은 base 브랜치의 이 파일을 실행하고 시크릿을 볼 수 있다.
 * PR 헤드를 checkout·build·실행하지 않는다.
 */
export function addAutoMergeDevelopWorkflow(
  rootProject: typescript.TypeScriptProject,
): void {
  const gh = rootProject.github;
  if (!gh) return;

  const workflow = new GithubWorkflow(gh, 'auto-merge-develop', {
    fileName: 'auto-merge-develop.yml',
  });

  workflow.on({
    pullRequestTarget: {
      branches: [src.constants.branches.develop],
      types: ['opened', 'reopened', 'ready_for_review', 'synchronize'],
    },
  });

  workflow.addJob('enable', {
    name: 'Enable auto-merge',
    runsOn: ['ubuntu-latest'],
    permissions: {
      contents: JobPermission.READ,
    },
    if: '${{ github.event.pull_request.draft == false && github.event.pull_request.head.repo.full_name == github.repository }}',
    steps: [
      {
        name: 'Enable auto-merge',
        env: {
          GH_TOKEN: '${{ secrets.WORKFLOW_TOKEN }}',
          GH_REPO: '${{ github.repository }}',
          PR: '${{ github.event.pull_request.number }}',
        },
        run: [
          'if [ "$(gh pr view "$PR" --json autoMergeRequest --jq \'.autoMergeRequest != null\')" = "true" ]; then',
          '  echo "auto-merge already enabled for #$PR"',
          '  exit 0',
          'fi',
          'gh pr merge "$PR" --merge --auto',
        ].join('\n'),
      },
    ],
  });
}
