import { typescript } from 'projen';

/**
 * projen ActionRefs 중 태그로 남은 action을 commit SHA로 고정.
 * github.actions override는 모든 workflow step의 `uses`에 적용된다.
 * docs/issues/resolved/2026-10-17-nexus-error-handling-hardening.md
 */
export function pinWorkflowActions(
  rootProject: typescript.TypeScriptProject,
): void {
  const actions = rootProject.github?.actions;
  if (!actions) return;

  // v7.0.0
  actions.set(
    'actions/setup-node',
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  );
  // v6.0.10
  actions.set(
    'pnpm/action-setup',
    'pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86',
  );
  // v8.1.1
  actions.set(
    'peter-evans/create-pull-request',
    'peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1',
  );
  // v7.0.0
  actions.set(
    'pulumi/actions',
    'pulumi/actions@8e5e406f4007fca908480587cb9893c07090f58d',
  );
}
