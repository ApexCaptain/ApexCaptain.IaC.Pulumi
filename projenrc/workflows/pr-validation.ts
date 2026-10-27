import { typescript } from 'projen';
import { ActionRefs, GithubWorkflow } from 'projen/lib/github';
import { JobPermission } from 'projen/lib/github/workflows-model';
import * as src from '../../src';

/** PR 정적 검증 — 시크릿 없음. docs/issues/resolved/2026-09-11-pr-ci-validation-pipeline.md */
export function addPrValidationWorkflow(
  rootProject: typescript.TypeScriptProject,
): void {
  const gh = rootProject.github;
  if (!gh) return;

  const workflow = new GithubWorkflow(gh, 'pr-validation', {
    limitConcurrency: true,
    concurrencyOptions: {
      group:
        '${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}',
      cancelInProgress: true,
    },
    fileName: 'pr-validation.yml',
  });

  workflow.on({
    pullRequest: {
      branches: [src.constants.branches.main, src.constants.branches.develop],
    },
  });

  workflow.addJob('validate', {
    name: 'Validate',
    runsOn: ['ubuntu-latest'],
    permissions: {
      contents: JobPermission.READ,
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
        name: 'Validate AI agent config',
        run: 'pnpm ai:doctor',
      },
      {
        name: 'Build workspaces',
        run: 'pnpm build:workspaces',
      },
      {
        name: 'Test workspaces',
        run: 'pnpm test:workspaces',
      },
      {
        name: 'Test scripts',
        run: 'pnpm test:scripts',
      },
      {
        name: 'ESLint',
        run: 'pnpm eslint',
      },
    ],
  });
}
