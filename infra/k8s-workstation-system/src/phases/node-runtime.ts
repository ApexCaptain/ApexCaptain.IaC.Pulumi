import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import * as components from '../components';
import { SystemProviders } from './providers';

/** 노드 런타임 계층: CNI 리소스, lxcfs, Sysbox·GPU RuntimeClass, 장치 플러그인. */
export const deployNodeRuntime = (deps: { providers: SystemProviders }) => {
  const commonEsc = nexus.esc.commonEsc;
  const { workstationK8sProvider } = deps.providers;

  // Cilium
  const ciliumResources = new components.cilium.CiliumResourcesComponent(
    'ciliumResources',
    {
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
  );

  // Lxcfs
  const lxcfsHelmChart = new components.lxcfs.LxcfsHelmChartComponent(
    'lxcfsHelmChart',
    {
      helm: {
        lxcfs: {
          version: utils.configs.helmChartVersions.lxcfs,
          repositoryUrl:
            commonEsc.esc.helmRepositoryUrls[
              'cndoit18.github.io/lxcfs-on-kubernetes'
            ],
        },
      },
      kubeconfig: nexus.esc.commonEsc.esc.workstationKubeconfig,
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
  );

  // Sysbox — RuntimeClass만 (호스트 설치는 Ansible/Kubespray)
  const sysbox = new components.sysbox.SysboxComponent('sysbox', {
    providers: {
      kubernetes: workstationK8sProvider,
    },
  });

  // Generic Device Plugin — 호스트 /dev를 extended resource로 노출
  const genericDevicePluginHelmChart =
    new components.genericDevicePlugin.GenericDevicePluginHelmChartComponent(
      'genericDevicePluginHelmChart',
      {
        helm: {
          genericDevicePlugin: {
            version: utils.configs.helmChartVersions.genericDevicePlugin,
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls['charts.gabe565.com'],
          },
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
    );

  // GPU — RuntimeClass + Operator (호스트 driver/toolkit은 Ansible)
  const gpuRuntimeClass = new components.gpuOperator.GpuRuntimeClassComponent(
    'gpuRuntimeClass',
    {
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
  );

  const gpuOperatorHelmChart =
    new components.gpuOperator.GpuOperatorHelmChartComponent(
      'gpuOperatorHelmChart',
      {
        helm: {
          gpuOperator: {
            version: utils.configs.helmChartVersions.gpuOperator,
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls['helm.ngc.nvidia.com/nvidia'],
          },
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      { dependsOn: [gpuRuntimeClass] },
    );

  return {
    ciliumResources,
    lxcfsHelmChart,
    sysbox,
    genericDevicePluginHelmChart,
    gpuRuntimeClass,
    gpuOperatorHelmChart,
  };
};
