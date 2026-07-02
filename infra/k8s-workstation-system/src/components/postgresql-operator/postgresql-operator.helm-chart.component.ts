import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface PostgreSQLOperatorHelmChartComponentArgsShape {
  helm: {
    postgresqlOperator: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type PostgreSQLOperatorHelmChartComponentArgs =
  utils.types.DeepPulumiInput<PostgreSQLOperatorHelmChartComponentArgsShape>;

export const PostgreSQLOperatorHelmChartComponent =
  utils.functions.defineComponent(
    'postgresqlOperatorHelmChart',
    (
      args: PostgreSQLOperatorHelmChartComponentArgs,
      opts: pulumi.ComponentResourceOptions,
      resourceName: string,
    ) => {
      const namespace = new kubernetes.core.v1.Namespace(
        `${resourceName}-namespace`,
        {
          metadata: {
            name: 'postgresql-operator',
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

      const postgresqlOperatorHelmChartRelease = new kubernetes.helm.v3.Release(
        `${resourceName}-postgresql-operator-helm-chart-release`,
        {
          name: 'postgresql-operator',
          chart: 'cloudnative-pg',
          version: args.helm.postgresqlOperator.version,
          namespace: namespace.metadata.name,
          repositoryOpts: {
            repo: args.helm.postgresqlOperator.repositoryUrl,
          },
          waitForJobs: true,
          values: {},
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
          dependsOn: [namespace],
        },
      );

      return {
        output: pulumi.output({}),
        secret: pulumi.output({}),
      };
    },
  );
