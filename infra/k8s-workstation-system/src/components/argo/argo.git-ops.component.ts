/**
 * Argo GitOps GitHub 부착.
 *
 * 레포 자체는 `@infra/github` 카탈로그. 여기선 read-only deploy key와
 * Argo CD webhook만 붙인다. 키 회전은 PrivateKey `extraKeepers.gitOpsRepositoryName`
 * — 레포를 지우고 다시 만들면 GitHub 지문 충돌을 피하려고 키가 바뀐다.
 */
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as github from '@pulumi/github';
import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';

interface ArgoGitOpsComponentArgsShape {
  gitOpsRepository: {
    name: string;
    sshCloneUrl: string;
  };
  argoCdHost: string;
  providers: {
    github: github.Provider;
  };
}

export type ArgoGitOpsComponentArgs =
  utils.types.DeepPulumiInput<ArgoGitOpsComponentArgsShape>;

export const ArgoGitOpsComponent = utils.functions.defineComponent(
  'argoGitOps',
  (
    args: ArgoGitOpsComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const gitOpsPrivateKey =
      new customResources.components.tls.PrivateKeyV1Component(
        `${resourceName}-gitOpsPrivateKey`,
        {
          expirationDateString: utils.functions
            .createExpirationInterval({
              days: 15,
            })
            .toDateString(),
          createKeyFile: false,
          extraKeepers: {
            gitOpsRepositoryName: args.gitOpsRepository.name,
          },
        },
        {
          ...opts,
        },
      );

    new github.RepositoryDeployKey(
      `${resourceName}-gitOpsDeployKey`,
      {
        title: 'argo-git-ops-deploy-key',
        key: gitOpsPrivateKey.secret.publicKey.openssh,
        repository: args.gitOpsRepository.name,
        readOnly: true,
      },
      {
        ...opts,
        provider: args.providers.github,
        dependsOn: [gitOpsPrivateKey],
      },
    );

    const argoWebHookSecret = new random.RandomString(
      `${resourceName}-argoWebHookSecret`,
      {
        length: 32,
        special: false,
        upper: false,
        lower: true,
        numeric: true,
        keepers: {
          expirationDate: utils.functions
            .createExpirationInterval({
              days: 15,
            })
            .toDateString(),
        },
      },
      {
        ...opts,
      },
    );

    new github.RepositoryWebhook(
      `${resourceName}-argoWebHook`,
      {
        repository: args.gitOpsRepository.name,
        events: ['push'],
        configuration: {
          url: pulumi.interpolate`https://${args.argoCdHost}/api/webhook`,
          contentType: 'json',
          secret: argoWebHookSecret.result,
          insecureSsl: false,
        },
        active: true,
      },
      {
        ...opts,
        provider: args.providers.github,
        dependsOn: [argoWebHookSecret],
      },
    );

    return {
      output: pulumi.output({
        gitOpsRepository: args.gitOpsRepository,
      }),
      secret: pulumi.secret({
        webHookSecret: argoWebHookSecret.result,
        deployPrivateKeyPem: gitOpsPrivateKey.secret.privateKey.pem,
      }),
    };
  },
);
