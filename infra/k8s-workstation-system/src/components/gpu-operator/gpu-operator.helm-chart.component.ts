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
          driver: {
            enabled: false,
          },
          toolkit: {
            enabled: false,
          },
          devicePlugin: {
            enabled: true,
          },
          dcgmExporter: {
            enabled: true,
          },
          nfd: {
            enabled: true,
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
