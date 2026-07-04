import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface VaultSecretsOperatorHelmChartComponentArgsShape {
  helm: {
    vaultSecretOperator: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type VaultSecretsOperatorHelmChartComponentArgs =
  utils.types.DeepPulumiInput<VaultSecretsOperatorHelmChartComponentArgsShape>;

export const VaultSecretsOperatorHelmChartComponent =
  utils.functions.defineComponent(
    'vaultSecretsOperatorHelmChart',
    (
      args: VaultSecretsOperatorHelmChartComponentArgs,
      opts: pulumi.ComponentResourceOptions,
      resourceName: string,
    ) => {
      const namespace = new kubernetes.core.v1.Namespace(
        `${resourceName}-namespace`,
        {
          metadata: {
            name: 'vault-secrets-operator',
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

      const vaultSecretsOperatorHelmChartRelase =
        new kubernetes.helm.v3.Release(
          `${resourceName}-vaultSecretsOperatorHelmChartRelase`,
          {
            name: 'vault-secrets-operator',
            chart: 'vault-secrets-operator',
            version: args.helm.vaultSecretOperator.version,
            namespace: namespace.metadata.name,
            repositoryOpts: {
              repo: args.helm.vaultSecretOperator.repositoryUrl,
            },
            waitForJobs: true,
          },
          {
            ...opts,
            provider: args.providers.kubernetes,
          },
        );

      return {
        output: pulumi.output({
          namespace: namespace.metadata.name,
        }),
        secret: pulumi.secret({}),
      };
    },
  );
