import * as nexus from '@common/nexus';
import * as utils from '@common/utils';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import { k8sWorkstationSystemContract } from '@infra/k8s-workstation-system/src/contract';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as components from './components';

export const k8sWorkstationAppsContract = new nexus.classes.Contract(
  __filename,
  async () => {
    // ESC
    const commonEsc = nexus.esc.commonEsc;
    const projectEsc = nexus.esc.k8sWorkstationAppsEsc;

    // K8s Provider
    const workstationK8sProvider = new kubernetes.Provider(
      'workstationK8sProvider',
      {
        kubeconfig: k8sWorkstationSystemContract.output.kubeConfigFilePath,
      },
    );

    // Production Only Apps
    if (pulumi.getStack() === utils.enums.StackStage.PROD) {
      // Jellyfin
      const jellyfin = new components.jellyfin.JellyfinHelmChartComponent(
        'jellyfin',
        {
          namespace: 'jellyfin',
          version: '3.2.0',
          jellyfinDomain:
            cloudflareContract.output.zones.ayteneve93com.records.jellyfin,
          ingressGatewayPath:
            k8sWorkstationSystemContract.output.gatewayPaths.ingressGatewayPath,
          ssdStorageClassName:
            k8sWorkstationSystemContract.output.storageClass.ssd0,
          hddStorageClassName:
            k8sWorkstationSystemContract.output.storageClass.hdd0,
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
      );
    }

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
