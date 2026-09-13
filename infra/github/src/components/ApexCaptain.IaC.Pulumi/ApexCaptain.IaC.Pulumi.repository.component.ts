/**
 * ApexCaptain.IaC.Pulumi GitHub 레포.
 *
 * 레포 자체는 이미 있다. `github.Repository`로 형상만 맞추고
 * stack destroy 때 GitHub에서 삭제하지 않는다 (`retainOnDelete`).
 * ruleset·Actions secret은 Pulumi가 create/delete 한다 (`deleteBeforeReplace`).
 *
 * 워크플로 YAML은 Projen SSOT. 여기 두지 않는다.
 * output은 카탈로그 소비자용 `name` / `sshCloneUrl`만.
 */
import * as utils from '@common/utils';
import * as github from '@pulumi/github';
import * as pulumi from '@pulumi/pulumi';

interface ApexCaptainIaCPulumiRepositoryComponentArgsShape {
  repositoryName: string;
  actionsSecrets: {
    pulumiAccessToken: string;
    workflowToken: string;
  };
  providers: {
    github: github.Provider;
  };
}

export type ApexCaptainIaCPulumiRepositoryComponentArgs =
  utils.types.DeepPulumiInput<ApexCaptainIaCPulumiRepositoryComponentArgsShape>;

export const ApexCaptainIaCPulumiRepositoryComponent =
  utils.functions.defineComponent(
    'ApexCaptain.IaC.Pulumi.repository',
    (
      args: ApexCaptainIaCPulumiRepositoryComponentArgs,
      opts: pulumi.ComponentResourceOptions,
      resourceName: string,
    ) => {
      const repository = new github.Repository(
        `${resourceName}-repository`,
        {
          name: args.repositoryName,
          description:
            'Pulumi TypeScript IaC for ApexCaptain workstation — Kubernetes, Cloudflare, and GitHub.',
          topics: [
            'pulumi',
            'typescript',
            'kubernetes',
            'infrastructure-as-code',
            'homelab',
            'gitops',
          ],
          visibility: 'public',
          hasIssues: true,
          hasWiki: true,
          hasProjects: true,
          hasDiscussions: false,
          allowMergeCommit: true,
          allowSquashMerge: true,
          allowRebaseMerge: true,
          allowAutoMerge: false,
          deleteBranchOnMerge: true,
          allowUpdateBranch: false,
          allowForking: true,
          isTemplate: false,
          archived: false,
          webCommitSignoffRequired: false,
          mergeCommitTitle: 'MERGE_MESSAGE',
          mergeCommitMessage: 'PR_TITLE',
          squashMergeCommitTitle: 'COMMIT_OR_PR_TITLE',
          squashMergeCommitMessage: 'COMMIT_MESSAGES',
        },
        {
          ...opts,
          provider: args.providers.github,
          retainOnDelete: true,
        },
      );

      // gitflow 보호 브랜치. 두 ruleset이 같이 쓴다.
      const protectedRefs = {
        includes: ['refs/heads/main', 'refs/heads/develop'],
        excludes: [],
      };

      // projen `pr-validation` job 이름 `Validate`
      new github.RepositoryRuleset(
        `${resourceName}-prValidationRuleset`,
        {
          name: 'PR validation required',
          repository: repository.name,
          target: 'branch',
          enforcement: 'active',
          conditions: {
            refName: protectedRefs,
          },
          rules: {
            requiredStatusChecks: {
              doNotEnforceOnCreate: true,
              strictRequiredStatusChecksPolicy: false,
              requiredChecks: [{ context: 'Validate' }],
            },
          },
        },
        {
          ...opts,
          provider: args.providers.github,
          deleteBeforeReplace: true,
        },
      );

      new github.RepositoryRuleset(
        `${resourceName}-branchDeletionRuleset`,
        {
          name: 'Protect main and develop from deletion',
          repository: repository.name,
          target: 'branch',
          enforcement: 'active',
          conditions: {
            refName: protectedRefs,
          },
          rules: {
            deletion: true,
          },
        },
        {
          ...opts,
          provider: args.providers.github,
          deleteBeforeReplace: true,
        },
      );

      // GitHub Actions 저장소 시크릿. 워크플로 YAML은 Projen.
      new github.ActionsSecret(
        `${resourceName}-pulumiAccessToken`,
        {
          repository: repository.name,
          secretName: 'PULUMI_ACCESS_TOKEN',
          value: args.actionsSecrets.pulumiAccessToken,
        },
        {
          ...opts,
          provider: args.providers.github,
        },
      );

      new github.ActionsSecret(
        `${resourceName}-workflowToken`,
        {
          repository: repository.name,
          secretName: 'WORKFLOW_TOKEN',
          value: args.actionsSecrets.workflowToken,
        },
        {
          ...opts,
          provider: args.providers.github,
        },
      );

      return {
        output: pulumi.output({
          name: repository.name,
          sshCloneUrl: repository.sshCloneUrl,
        }),
        secret: pulumi.secret({}),
      };
    },
  );
