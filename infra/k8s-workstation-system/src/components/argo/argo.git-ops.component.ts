import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as github from '@pulumi/github';
import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';

interface ArgoGitOpsComponentArgsShape {
  gitOpsRepositoryName: string;
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
    const dataGitOpsRepository = pulumi
      .output(args.gitOpsRepositoryName)
      .apply(async resolvedGitOpsRepositoryName => {
        const repository = await github.getRepository(
          {
            name: resolvedGitOpsRepositoryName,
          },
          {
            provider: args.providers.github,
          },
        );

        // invoke 결과를 평평한 string Output으로. defineComponent를 거친
        // nested GetRepositoryResult는 sshCloneUrl 같은 필드가 빠질 수 있음.
        return {
          name: repository.name,
          sshCloneUrl: repository.sshCloneUrl,
        };
      });

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
        repository: args.gitOpsRepositoryName,
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
        repository: args.gitOpsRepositoryName,
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
      output: dataGitOpsRepository.apply(repository => ({
        dataGitOpsRepository: repository,
      })),
      secret: pulumi.secret({
        webHookSecret: argoWebHookSecret.result,
        deployPrivateKeyPem: gitOpsPrivateKey.secret.privateKey.pem,
      }),
    };
  },
);
