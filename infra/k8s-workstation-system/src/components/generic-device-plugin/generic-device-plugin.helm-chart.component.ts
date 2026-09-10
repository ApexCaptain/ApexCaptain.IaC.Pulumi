/**
 * generic-device-plugin (gabe565 / squat)
 *
 * 노드 `/dev` 장치를 K8s extended resource로 노출하는 privileged DaemonSet.
 * mesh 밖 (`istio.io/dataplane-mode: none`).
 *
 * config.data 는 workstation-0 실측 장치 기준 (fuse).
 * GPU(/dev/dri)는 generic-device-plugin에서 노출하지 않음 — GPU Operator(nvidia.com/gpu)로 이관.
 * Pod 사용 예: resources.limits["squat.ai/fuse"] = "1" (Coder Sysbox)
 *
 * @see https://artifacthub.io/packages/helm/gabe565/generic-device-plugin
 * @see https://github.com/squat/generic-device-plugin
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import yaml from 'yaml';

interface GenericDevicePluginHelmChartComponentArgsShape {
  helm: {
    genericDevicePlugin: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type GenericDevicePluginHelmChartComponentArgs =
  utils.types.DeepPulumiInput<GenericDevicePluginHelmChartComponentArgsShape>;

/** squat 플러그인 YAML의 device 항목 */
export type GenericDevicePluginSetting = {
  name: string;
  groups: {
    count?: number;
    paths: {
      path: string;
      mountPath?: string;
    }[];
  }[];
};

/** extended resource 도메인. 최종 이름은 squat.ai/<name> */
const DEVICE_DOMAIN = 'squat.ai';

/**
 * workstation-0에서 확인한 호스트 경로만.
 * 차트 기본값(serial / video0 / capture)은 이 노드에 없어서 제외.
 */
const DEVICE_PLUGIN_SETTINGS: GenericDevicePluginSetting[] = [
  {
    name: 'fuse',
    groups: [
      {
        count: 10,
        paths: [{ path: '/dev/fuse' }],
      },
    ],
  },
];

export const GenericDevicePluginHelmChartComponent =
  utils.functions.defineComponent(
    'genericDevicePluginHelmChart',
    (
      args: GenericDevicePluginHelmChartComponentArgs,
      opts: pulumi.ComponentResourceOptions,
      resourceName: string,
    ) => {
      const namespace = new kubernetes.core.v1.Namespace(
        `${resourceName}-namespace`,
        {
          metadata: {
            name: 'generic-device-plugin',
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
        `${resourceName}-genericDevicePluginHelmChartRelease`,
        {
          name: 'generic-device-plugin',
          chart: 'generic-device-plugin',
          version: args.helm.genericDevicePlugin.version,
          namespace: namespace.metadata.name,
          repositoryOpts: {
            repo: args.helm.genericDevicePlugin.repositoryUrl,
          },
          waitForJobs: true,
          values: {
            env: {
              DOMAIN: DEVICE_DOMAIN,
            },
            config: {
              enabled: true,
              data: yaml.stringify({ devices: DEVICE_PLUGIN_SETTINGS }),
            },
            // 차트 기본: privileged DaemonSet + hostPath /dev + kubelet plugin 등록
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
          deviceDomain: DEVICE_DOMAIN,
        }),
        secret: pulumi.secret({}),
      };
    },
  );
