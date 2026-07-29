import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface ArgoRolloutsComponentArgsShape {
  helm: {
    argoRollouts: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type ArgoRolloutsComponentArgs =
  utils.types.DeepPulumiInput<ArgoRolloutsComponentArgsShape>;

export const ArgoRolloutsComponent = utils.functions.defineComponent(
  'argoRollouts',
  (
    args: ArgoRolloutsComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'argo-rollouts',
          labels: {
            // @ToDo 일단 끄고, 이상 없으면 ambient로 전환 -> 이후 PA를 STRICT로 모드 격상
            'istio.io/dataplane-mode': 'none',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    new kubernetes.helm.v3.Release(
      `${resourceName}-argoRolloutsHelmChartRelease`,
      {
        name: 'argo-rollouts',
        chart: 'argo-rollouts',
        version: args.helm.argoRollouts.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.argoRollouts.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          // Controller-only. Dashboard / Argo CD UI extension은 후속.
          installCRDs: true,
          dashboard: {
            enabled: false,
          },
          controller: {
            // idle ~21–26Mi
            resources: {
              requests: {
                cpu: '20m',
                memory: '64Mi',
              },
              limits: {
                cpu: '200m',
                memory: '256Mi',
              },
            },
          },
        },
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
