/**
 * Fairwinds VPA Helm — recommender only
 *
 * Goldilocks 추천값 계산용. updater/admissionController는 Pod를 건드리고
 * mutating webhook 장애점이 생기므로 비활성. mesh 밖 (`dataplane-mode: none`).
 *
 * @see https://artifacthub.io/packages/helm/fairwinds-stable/vpa
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface VpaHelmChartComponentArgsShape {
  helm: {
    vpa: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type VpaHelmChartComponentArgs =
  utils.types.DeepPulumiInput<VpaHelmChartComponentArgsShape>;

export const VpaHelmChartComponent = utils.functions.defineComponent(
  'vpaHelmChart',
  (
    args: VpaHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'vpa',
          labels: {
            'istio.io/dataplane-mode': 'none',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const release = new kubernetes.helm.v3.Release(
      `${resourceName}-vpaHelmChartRelease`,
      {
        name: 'vpa',
        chart: 'vpa',
        version: args.helm.vpa.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.vpa.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          recommender: {
            enabled: true,
          },
          updater: {
            enabled: false,
          },
          admissionController: {
            enabled: false,
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
        releaseName: release.name,
      }),
      secret: pulumi.secret({}),
    };
  },
);
