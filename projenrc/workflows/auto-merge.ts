import { typescript } from 'projen';
import { GithubWorkflow } from 'projen/lib/github';
import { JobPermission } from 'projen/lib/github/workflows-model';
import * as src from '../../src';

/** 기다릴 체크: pr-validation job `Validate`, pull-request-lint job `Validate PR title`. */
const REQUIRED_CHECKS = ['Validate', 'Validate PR title'];

const SELF_JOB_NAME = 'Merge when validated';

/**
 * develop·main 대상 PR을 필수 체크 통과 뒤 merge commit 으로 머지한다.
 *
 * GitHub native auto-merge(`gh pr merge --auto`)는 쓰지 않는다. develop 은 직접 push 를 허용하려고
 * ruleset 에서 required status check 를 뺐기 때문에, native auto-merge 는 체크를 기다리지 않고 바로 머지한다.
 * 그래서 워크플로가 head SHA 의 check run 을 직접 폴링한다.
 *
 * - develop→main PR 은 head=develop. 머지 후 브랜치 자동 삭제는 ruleset(deletion)이 막는다.
 *   `--delete-branch`를 넘기지 않고 repo 설정 `deleteBranchOnMerge`에 맡긴다.
 * - 머지는 `WORKFLOW_TOKEN`(PAT)으로 한다. GITHUB_TOKEN 머지는 develop push 워크플로를 트리거하지 않는다.
 * - `pull_request_target`은 **base 브랜치**의 이 파일을 실행한다. PR 헤드를 checkout·실행하지 않는다.
 */
export function addAutoMergeWorkflow(
  rootProject: typescript.TypeScriptProject,
): void {
  const gh = rootProject.github;
  if (!gh) return;

  const workflow = new GithubWorkflow(gh, 'auto-merge', {
    fileName: 'auto-merge.yml',
  });

  workflow.on({
    pullRequestTarget: {
      branches: [src.constants.branches.develop, src.constants.branches.main],
      types: ['opened', 'reopened', 'ready_for_review', 'synchronize'],
    },
  });

  workflow.addJob('merge', {
    name: SELF_JOB_NAME,
    runsOn: ['ubuntu-latest'],
    permissions: {
      checks: JobPermission.READ,
    },
    concurrency: {
      group: '${{ github.workflow }}-${{ github.event.pull_request.number }}',
      'cancel-in-progress': true,
    },
    timeoutMinutes: 35,
    if: '${{ github.event.pull_request.draft == false && github.event.pull_request.head.repo.full_name == github.repository }}',
    steps: [
      {
        name: 'Wait for checks and merge',
        env: {
          GH_TOKEN: '${{ secrets.WORKFLOW_TOKEN }}',
          GH_REPO: '${{ github.repository }}',
          PR: '${{ github.event.pull_request.number }}',
          HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
          SELF_NAME: SELF_JOB_NAME,
          REQUIRED_CHECKS: REQUIRED_CHECKS.join('\n'),
          TIMEOUT_SECONDS: '1800',
        },
        run: [
          'set -euo pipefail',
          'while true; do',
          '  runs=$(gh api "repos/$GH_REPO/commits/$HEAD_SHA/check-runs?per_page=100" \\',
          "    --jq '[.check_runs[] | select(.name != env.SELF_NAME)] | group_by(.name) | map(max_by(.id))')",
          '  failed=$(jq -r \'[.[] | select(.status == "completed" and (.conclusion | IN("success", "neutral", "skipped") | not)) | .name] | join(", ")\' <<< "$runs")',
          '  if [ -n "$failed" ]; then',
          '    echo "::error::실패한 체크가 있어 머지하지 않습니다: $failed"',
          '    exit 1',
          '  fi',
          '  waiting=0',
          '  while IFS= read -r name; do',
          '    done_count=$(jq -r --arg n "$name" \'[.[] | select(.name == $n and .status == "completed")] | length\' <<< "$runs")',
          '    [ "$done_count" -ge 1 ] || waiting=1',
          '  done <<< "$REQUIRED_CHECKS"',
          '  open_count=$(jq -r \'[.[] | select(.status != "completed")] | length\' <<< "$runs")',
          '  if [ "$waiting" -eq 0 ] && [ "$open_count" -eq 0 ]; then',
          '    break',
          '  fi',
          '  if [ "$SECONDS" -ge "$TIMEOUT_SECONDS" ]; then',
          '    echo "::error::체크가 $((TIMEOUT_SECONDS / 60))분 안에 끝나지 않아 머지하지 않습니다"',
          '    exit 1',
          '  fi',
          '  sleep 20',
          'done',
          'echo "필수 체크 통과: #$PR ($HEAD_SHA)"',
          'gh pr merge "$PR" --merge --match-head-commit "$HEAD_SHA"',
        ].join('\n'),
      },
    ],
  });
}
