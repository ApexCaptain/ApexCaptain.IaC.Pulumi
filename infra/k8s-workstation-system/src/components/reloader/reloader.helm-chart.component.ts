import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface ReloaderHelmChartComponentArgsShape {
  helm: {
    reloader: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type ReloaderHelmChartComponentArgs =
  utils.types.DeepPulumiInput<ReloaderHelmChartComponentArgsShape>;

export const ReloaderHelmChartComponent = utils.functions.defineComponent(
  'reloaderHelmChart',
  (
    args: ReloaderHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'reloader',
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    new kubernetes.helm.v3.Release(
      `${resourceName}-reloaderHelmChartRelease`,
      {
        name: 'reloader',
        chart: 'reloader',
        version: args.helm.reloader.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.reloader.repositoryUrl,
        },
        waitForJobs: true,
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [namespace],
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
