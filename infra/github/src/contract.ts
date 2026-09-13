/**
 * GitHub 레포 카탈로그.
 *
 * ApexCaptain 계정 레포의 형상·ruleset·Actions secret을 한 스택에서 관리한다.
 * 이 IaC 레포는 이미 있으므로 destroy로 GitHub에서 지우지 않는다 (`retainOnDelete`).
 * 다른 infra 스택은 이 contract를 참조하지 않는다.
 */
import * as nexus from '@common/nexus';
import * as github from '@pulumi/github';
import * as pulumi from '@pulumi/pulumi';
import * as components from './components';

export const GithubContract = new nexus.classes.Contract(
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
            githubEsc.esc.apexCaptain.repositories.iacPulumi.name,
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

    return {
      output: pulumi.output({
        repositories: {
          iacPulumi: apexCaptainIaCPulumiRepository.output,
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
