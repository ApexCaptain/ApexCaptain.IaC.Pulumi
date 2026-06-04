import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface MetricsServerHelmChartComponentArgsShape {
  helm: {
    metricsServer: {
      version: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type MetricsServerHelmChartComponentArgs =
  utils.types.DeepPulumiInput<MetricsServerHelmChartComponentArgsShape>;

export const MetricsServerHelmChartComponent = utils.functions.defineComponent(
  'metricsServerHelmChart',
  (
    args: MetricsServerHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'metrics-server',
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const metricsServerRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-metricsServerRelease`,
      {
        name: 'metrics-server',
        chart: 'metrics-server',
        version: args.helm.metricsServer.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: 'https://kubernetes-sigs.github.io/metrics-server',
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
