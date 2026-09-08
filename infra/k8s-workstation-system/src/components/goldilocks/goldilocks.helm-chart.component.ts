/**
 * Fairwinds Goldilocks Helm — controller + dashboard
 *
 * VPA recommender 위에 얹는 추천 대시보드. 네임스페이스는 opt-in 라벨
 * (`goldilocks.fairwinds.com/enabled=true`)로만 감시. ambient mesh.
 * VPA는 별도 차트 — 서브차트(`vpa.enabled`) 사용 안 함.
 *
 * @see https://artifacthub.io/packages/helm/fairwinds-stable/goldilocks
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface GoldilocksHelmChartComponentArgsShape {
  helm: {
    goldilocks: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type GoldilocksHelmChartComponentArgs =
  utils.types.DeepPulumiInput<GoldilocksHelmChartComponentArgsShape>;

export const GoldilocksHelmChartComponent = utils.functions.defineComponent(
  'goldilocksHelmChart',
  (
    args: GoldilocksHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'goldilocks',
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

    const release = new kubernetes.helm.v3.Release(
      `${resourceName}-goldilocksHelmChartRelease`,
      {
        name: 'goldilocks',
        chart: 'goldilocks',
        version: args.helm.goldilocks.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.goldilocks.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          // VPA는 별도 차트로 관리 (Fairwinds 권장)
          'vpa': {
            enabled: false,
          },
          'metrics-server': {
            enabled: false,
          },
          // Fairwinds Insights 비용 추정 마케팅 배너 비활성
          'dashboard': {
            flags: {
              'enable-cost': 'false',
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
        releaseName: release.name,
        services: {
          goldilocksDashboard: {
            // helm release name `goldilocks` → service `goldilocks-dashboard`
            name: 'goldilocks-dashboard',
            port: {
              http: 80,
            },
          },
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
