/**
 * GitHub 레포 카탈로그.
 *
 * ApexCaptain 계정 레포 정체성을 한 스택에서 관리한다.
 * IaC 레포는 이미 있으므로 destroy로 GitHub에서 지우지 않는다 (`retainOnDelete`).
 * GitOps 레포는 이 스택이 만들며 `protect` — Pulumi가 GitHub에서 삭제하지 않는다.
 * `@infra/k8s-workstation-system`이 GitOps `name`/`sshCloneUrl`을 참조하고
 * deploy key·webhook은 그쪽에서 붙인다.
 */
import * as nexus from '@common/nexus';
import * as github from '@pulumi/github';
import * as pulumi from '@pulumi/pulumi';
import * as components from './components';

export const githubContract = new nexus.classes.Contract(
  __filename,
  async () => {
    const githubEsc = nexus.esc.githubEsc;

    const apexCaptainGithubProvider = new github.Provider(
      'apexCaptainGithubProvider',
      {
        owner: githubEsc.esc.apexCaptain.owner,
        token: githubEsc.esc.apexCaptain.token,
      },
    );

    const apexCaptainIaCPulumiRepository =
      new components.ApexCaptainIaCPulumiRepositoryComponent(
        'apexCaptainIaCPulumiRepository',
        {
          repositoryName:
            githubEsc.esc.apexCaptain.repositories.apexCaptainIacPulumi.name,
          actionsSecrets: {
            pulumiAccessToken:
              githubEsc.esc.apexCaptain.actions.pulumiAccessToken,
            workflowToken: githubEsc.esc.apexCaptain.actions.workflowToken,
          },
          providers: {
            github: apexCaptainGithubProvider,
          },
        },
      );

    const apexCaptainIacGitOpsRepository =
      new components.ApexCaptainIaCGitOpsRepositoryComponent(
        'apexCaptainIacGitOpsRepository',
        {
          repositoryName:
            githubEsc.esc.apexCaptain.repositories.apexCaptainIacGitOps.name,
          providers: {
            github: apexCaptainGithubProvider,
          },
        },
      );

    return {
      output: pulumi.output({
        repositories: {
          apexCaptainIacPulumi: apexCaptainIaCPulumiRepository.output,
          apexCaptainIacGitOps: apexCaptainIacGitOpsRepository.output,
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
