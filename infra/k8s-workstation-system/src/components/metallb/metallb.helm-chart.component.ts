import * as nexus from '@common/nexus/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface MetallbHelmChartComponentArgsShape {
  namespace: string;
  version: string;
  k8sProvider: kubernetes.Provider;
}

export type MetallbHelmChartComponentArgs =
  utils.types.DeepPulumiInput<MetallbHelmChartComponentArgsShape>;

export const MetallbHelmChartComponent = nexus.function.defineComponent(
  'metallbHelmChart',
  (
    args: MetallbHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      'namespace',
      {
        metadata: {
          name: args.namespace,
        },
      },
      {
        ...opts,
        provider: args.k8sProvider,
      },
    );

    const metallbRelease = new kubernetes.helm.v3.Release(
      'metallbRelease',
      {
        name: 'metallb',
        chart: 'metallb',
        version: args.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: 'https://metallb.github.io/metallb',
        },
        waitForJobs: true,
      },
      {
        ...opts,
        provider: args.k8sProvider,
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
