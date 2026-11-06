import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import * as components from '../components';
import { SystemProviders } from './providers';

/** 노드 런타임 계층: CNI 리소스, Kata·GPU RuntimeClass. */
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

  // Kata — RuntimeClass만 (호스트 설치는 Kubespray kata_containers_enabled)
  const kata = new components.kata.KataComponent('kata', {
    providers: {
      kubernetes: workstationK8sProvider,
    },
  });

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
    kata,
    gpuRuntimeClass,
    gpuOperatorHelmChart,
  };
};
