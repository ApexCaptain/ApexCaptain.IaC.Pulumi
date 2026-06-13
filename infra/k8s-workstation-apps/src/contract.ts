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
    /*
    if (pulumi.getStack() === utils.enums.StackStage.PROD) {
      // Jellyfin
      const jellyfinHelmChart =
        new components.jellyfin.JellyfinHelmChartComponent(
          'jellyfinHelmChart',
          {
            helm: {
              jellyfin: {
                version: '3.2.0',
                repositoryUrl:
                  commonEsc.esc.helmRepositoryUrls[
                    'jellyfin.github.io/jellyfin-helm'
                  ],
              },
            },
            pvc: {
              jellyfinConfig: {
                storageClass:
                  k8sWorkstationSystemContract.output.storageClass.ssd0,
                size: '100Mi',
              },
              jellyfinMedia: {
                storageClass:
                  k8sWorkstationSystemContract.output.storageClass.hdd0,
                size: '2Ti',
              },
            },
            providers: {
              kubernetes: workstationK8sProvider,
            },
          },
        );

      const jellyfinServiceMesh =
        new components.jellyfin.JellyfinServiceMeshComponent(
          'jellyfinServiceMesh',
          {
            namespace: jellyfinHelmChart.output.namespace,
            authorizationPolicy: {
              from: {
                istioIngress: {
                  namespace:
                    k8sWorkstationSystemContract.output.namespaces.istio,
                  serviceAccountName:
                    k8sWorkstationSystemContract.output.serviceAccounts
                      .istioIngressGateway,
                },
              },
            },
            ingress: {
              jellyfinWebUi: {
                host: cloudflareContract.output.zones.ayteneve93com.records
                  .jellyfin,
                serviceName: jellyfinHelmChart.output.services.jellyfin.name,
                gatewayPath:
                  k8sWorkstationSystemContract.output.gatewayPaths
                    .ingressGatewayPath,
                port: jellyfinHelmChart.output.services.jellyfin.port.webUi,
              },
            },
            providers: {
              kubernetes: workstationK8sProvider,
            },
          },
          {
            dependsOn: [jellyfinHelmChart],
          },
        );
    }
    */

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
