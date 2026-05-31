import * as nexus from '@common/nexus/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface MetricsServerComponentArgsShape {
  namespace: string;
  version: string;
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type MetricsServerComponentArgs =
  utils.types.DeepPulumiInput<MetricsServerComponentArgsShape>;

export const MetricsServerComponent = nexus.function.defineComponent(
  'metricsServer',
  (args: MetricsServerComponentArgs, opts: pulumi.ComponentResourceOptions) => {
    const namespace = new kubernetes.core.v1.Namespace(
      'namespace',
      {
        metadata: {
          name: args.namespace,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const metricsServerRelease = new kubernetes.helm.v3.Release(
      'metricsServerRelease',
      {
        name: 'metrics-server',
        chart: 'metrics-server',
        version: args.version,
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
