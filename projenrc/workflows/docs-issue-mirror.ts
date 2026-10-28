import { typescript } from 'projen';
import { ActionRefs, GithubWorkflow } from 'projen/lib/github';
import { JobPermission } from 'projen/lib/github/workflows-model';
import * as src from '../../src';

/**
 * docs/issues → GitHub Issues 단방향 미러. md가 SSOT, Issue는 읽기용.
 * 시크릿 없음 — 기본 GITHUB_TOKEN(issues: write)만 쓴다.
 * docs/issues/active/2026-10-27-github-issues-mirror.md
 */
export function addDocsIssueMirrorWorkflow(
  rootProject: typescript.TypeScriptProject,
): void {
  const gh = rootProject.github;
  if (!gh) return;

  const workflow = new GithubWorkflow(gh, 'docs-issue-mirror', {
    limitConcurrency: true,
    concurrencyOptions: {
      group: '${{ github.workflow }}',
      cancelInProgress: false,
    },
    fileName: 'docs-issue-mirror.yml',
  });

  workflow.on({
    push: {
      branches: [src.constants.branches.develop],
      paths: [
        'docs/issues/**',
        'scripts/sync-github-issues.script.ts',
        'scripts/common/docs-issue-mirror.ts',
      ],
    },
    workflowDispatch: {},
  });

  workflow.addJob('sync', {
    name: 'Sync docs/issues → GitHub Issues',
    runsOn: ['ubuntu-latest'],
    permissions: {
      contents: JobPermission.READ,
      issues: JobPermission.WRITE,
    },
    steps: [
      {
        name: 'Checkout',
        uses: ActionRefs.ACTIONS_CHECKOUT,
      },
      {
        name: 'Setup pnpm',
        uses: ActionRefs.PNPM_ACTION_SETUP,
        with: {
          version: '10.33.0',
        },
      },
      {
        name: 'Setup Node.js',
        uses: ActionRefs.ACTIONS_SETUP_NODE,
        with: {
          'node-version': '24',
          cache: 'pnpm',
        },
      },
      {
        name: 'Install dependencies',
        run: 'pnpm i --frozen-lockfile',
      },
      {
        name: 'Sync',
        run: `pnpm script:syncGithubIssues --apply --ref ${src.constants.branches.develop}`,
        env: {
          GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
        },
      },
    ],
  });
}
