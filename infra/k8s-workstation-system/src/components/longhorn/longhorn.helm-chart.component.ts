/**
 * Longhorn Helm — 분산 블록 스토리지
 *
 * 기본 Ingress는 끄고 Istio VirtualService로 UI를 연다.
 * default disk는 label 달린 노드에만 — Ventoy 노드 스펙과 맞춰 longhorn.resources에서 patch.
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface LonghornHelmChartComponentArgsShape {
  helm: {
    longhorn: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}
export type LonghornHelmChartComponentArgs =
  utils.types.DeepPulumiInput<LonghornHelmChartComponentArgsShape>;

export const LonghornHelmChartComponent = utils.functions.defineComponent(
  'longhornHelmChart',
  (
    args: LonghornHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'longhorn',
          labels: {
            'goldilocks.fairwinds.com/enabled': 'true',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const longhornRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-longhornRelease`,
      {
        name: 'longhorn',
        chart: 'longhorn',
        version: args.helm.longhorn.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.longhorn.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          ingress: {
            enabled: false, // Ingress 끄고 Istio VirtualService 사용
          },
          defaultSettings: {
            createDefaultDiskLabeledNodes: true, // 라벨이 붙은 노드에만 Default Disk 생성
            defaultReplicaCount: '1',
            // true면 Helm uninstall 허용. false면 차트 삭제를 막음.
            deletingConfirmationFlag: true,
          },
          persistence: {
            createStorageClass: false, // Helm이 StorageClass를 생성하지 않음
          },
          longhornManager: {
            // VPA 2026-10-12: target 335Mi / upper 345Mi
            resources: {
              requests: {
                cpu: '100m',
                memory: '384Mi',
              },
              limits: {
                cpu: '1',
                memory: '512Mi',
              },
            },
          },
          // 단일 노드. 기본 3 replica + preferred anti-affinity면 standby 2개가 같은 노드에 붙는다.
          longhornGlobalManager: {
            replicas: 1,
            // VPA 2026-10-12: target 121Mi / upper 189Mi
            resources: {
              requests: {
                cpu: '20m',
                memory: '160Mi',
              },
              limits: {
                cpu: '200m',
                memory: '256Mi',
              },
            },
          },
          // restrictInternalTraffic 기본 true. 9500은 Longhorn 컴포넌트만 열려 있다.
          // 스크랩은 monitoring NS의 central-collector만.
          networkPolicies: {
            metricsScrapeSources: [
              {
                namespaceSelector: {
                  matchLabels: {
                    'kubernetes.io/metadata.name': 'monitoring',
                  },
                },
                podSelector: {
                  matchLabels: {
                    'app.kubernetes.io/name': 'central-collector-collector',
                    'app.kubernetes.io/component':
                      'opentelemetry-collector',
                  },
                },
              },
            ],
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
        services: {
          longhornFrontend: {
            name: 'longhorn-frontend',
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
