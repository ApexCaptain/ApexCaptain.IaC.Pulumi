/**
 * NVIDIA GPU Operator (Helm)
 *
 * 호스트에 driver + nvidia-container-toolkit이 이미 있으므로 driver/toolkit은 비활성화.
 * device plugin (`nvidia.com/gpu`), NFD GPU 라벨, DCGM exporter만 Operator가 관리.
 * mesh 밖 (`istio.io/dataplane-mode: none`).
 *
 * @see https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/getting-started.html
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface GpuOperatorHelmChartComponentArgsShape {
  helm: {
    gpuOperator: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type GpuOperatorHelmChartComponentArgs =
  utils.types.DeepPulumiInput<GpuOperatorHelmChartComponentArgsShape>;

export const GpuOperatorHelmChartComponent = utils.functions.defineComponent(
  'gpuOperatorHelmChart',
  (
    args: GpuOperatorHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'gpu-operator',
          labels: {
            'istio.io/dataplane-mode': 'none',
            'goldilocks.fairwinds.com/enabled': 'true',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const release = new kubernetes.helm.v3.Release(
      `${resourceName}-gpuOperatorHelmChartRelease`,
      {
        name: 'gpu-operator',
        chart: 'gpu-operator',
        version: args.helm.gpuOperator.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.gpuOperator.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          'driver': {
            enabled: false,
          },
          'toolkit': {
            enabled: false,
          },
          'nfd': {
            enabled: true,
          },
          // 서브차트 이름은 node-feature-discovery. nfd.* 는 enable 조건만
          'node-feature-discovery': {
            // VPA 2026-10-12 master: target 100Mi. 차트 기본 limit 4Gi
            master: {
              resources: {
                requests: {
                  cpu: '100m',
                  memory: '128Mi',
                },
                limits: {
                  memory: '256Mi',
                },
              },
            },
            // VPA 2026-10-12 worker: target 100Mi / cpu 23m. 차트 기본 request 64Mi
            worker: {
              resources: {
                requests: {
                  cpu: '20m',
                  memory: '128Mi',
                },
                limits: {
                  cpu: '200m',
                  memory: '192Mi',
                },
              },
            },
            // VPA 2026-10-12 gc: target 100Mi. 차트 기본 limit 1Gi
            gc: {
              resources: {
                requests: {
                  cpu: '10m',
                  memory: '128Mi',
                },
                limits: {
                  memory: '256Mi',
                },
              },
            },
          },
          // VPA 2026-10-12 operator: mem target 156Mi. CPU request는 idle 편향이라 차트 200m 유지
          'operator': {
            resources: {
              requests: {
                cpu: '200m',
                memory: '192Mi',
              },
              limits: {
                cpu: '500m',
                memory: '350Mi',
              },
            },
          },
          // VPA 2026-10-12 validator: target 105Mi
          'validator': {
            resources: {
              requests: {
                cpu: '20m',
                memory: '128Mi',
              },
              limits: {
                cpu: '200m',
                memory: '192Mi',
              },
            },
          },
          'devicePlugin': {
            enabled: true,
            // VPA 2026-10-12: target 283Mi / upper 292Mi
            resources: {
              requests: {
                cpu: '20m',
                memory: '320Mi',
              },
              limits: {
                cpu: '200m',
                memory: '384Mi',
              },
            },
          },
          'dcgmExporter': {
            enabled: true,
            // VPA 2026-10-12: target 600Mi / upper 618Mi
            resources: {
              requests: {
                cpu: '50m',
                memory: '640Mi',
              },
              limits: {
                cpu: '200m',
                memory: '768Mi',
              },
            },
          },
          // VPA 2026-10-12 gpu-feature-discovery: target 100Mi
          'gfd': {
            resources: {
              requests: {
                cpu: '20m',
                memory: '128Mi',
              },
              limits: {
                cpu: '200m',
                memory: '192Mi',
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
        releaseName: release.name,
      }),
      secret: pulumi.secret({}),
    };
  },
);
