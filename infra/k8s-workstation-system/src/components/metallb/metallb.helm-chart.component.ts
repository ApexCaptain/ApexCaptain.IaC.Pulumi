import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface MetallbHelmChartComponentArgsShape {
  namespace: string;
  version: string;
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type MetallbHelmChartComponentArgs =
  utils.types.DeepPulumiInput<MetallbHelmChartComponentArgsShape>;

export const MetallbHelmChartComponent = utils.functions.defineComponent(
  'metallbHelmChart',
  (
    args: MetallbHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
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

    const metallbRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-metallbRelease`,
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
