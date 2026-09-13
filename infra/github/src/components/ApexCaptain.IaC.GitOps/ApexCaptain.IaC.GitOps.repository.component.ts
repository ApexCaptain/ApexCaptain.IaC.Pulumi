/**
 * ApexCaptain.IaC.GitOps GitHub 레포.
 *
 * Argo CD 소스. 이 스택이 생성하고 `protect`로 destroy 삭제를 막는다.
 * deploy key·webhook은 `@infra/k8s-workstation-system`이 붙인다.
 * output은 `name` / `sshCloneUrl`만.
 */
import * as utils from '@common/utils';
import * as github from '@pulumi/github';
import * as pulumi from '@pulumi/pulumi';

interface ApexCaptainIaCGitOpsRepositoryComponentArgsShape {
  repositoryName: string;
  providers: {
    github: github.Provider;
  };
}

export type ApexCaptainIaCGitOpsRepositoryComponentArgs =
  utils.types.DeepPulumiInput<ApexCaptainIaCGitOpsRepositoryComponentArgsShape>;

export const ApexCaptainIaCGitOpsRepositoryComponent =
  utils.functions.defineComponent(
    'ApexCaptain.IaC.GitOps.repository',
    (
      args: ApexCaptainIaCGitOpsRepositoryComponentArgs,
      opts: pulumi.ComponentResourceOptions,
      resourceName: string,
    ) => {
      const repository = new github.Repository(
        `${resourceName}-repository`,
        {
          name: args.repositoryName,
          description: 'GitOps for ApexCaptain k8s Argo CD',
          topics: ['gitops', 'kubernetes', 'infrastructure-as-code'],
          visibility: 'public',
        },
        {
          ...opts,
          provider: args.providers.github,
          protect: true,
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
