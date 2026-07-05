import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface ArgoCdComponentArgsShape {
  host: string;
  helm: {
    argoCd: {
      version: string;
      repositoryUrl: string;
    };
    argocdImageUpdate: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type ArgoCdComponentArgs =
  utils.types.DeepPulumiInput<ArgoCdComponentArgsShape>;

export const ArgoCdComponent = utils.functions.defineComponent(
  'argoCd',
  (
    args: ArgoCdComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'argo-cd',
          labels: {
            'istio.io/dataplane-mode': 'ambient',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const argoCdHelmChartRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-argoCdHelmChartRelease`,
      {
        name: 'argo-cd',
        chart: 'argo-cd',
        namespace: namespace.metadata.name,
        version: args.helm.argoCd.version,
        repositoryOpts: {
          repo: args.helm.argoCd.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          global: {
            domain: args.host,
          },
        },
      },
      {
        ...opts,
        dependsOn: [namespace],
        provider: args.providers.kubernetes,
      },
    );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
