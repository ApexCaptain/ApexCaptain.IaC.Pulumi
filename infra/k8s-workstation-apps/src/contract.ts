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
        kubeconfig: nexus.esc.commonEsc.esc.workstationKubeconfig,
      },
    );

    // Production Only Apps
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
            sftpUserName: commonEsc.esc.adapter.sftp.userName,
            directGateway: {
              gatewayPath:
                k8sWorkstationSystemContract.output.gatewayPaths
                  .directGatewayPath,
              jellyfinSftp: {
                port: commonEsc.esc.istioNetwork.workstationDirectGateway
                  .jellyfinSftpPort,
              },
            },
            pvc: {
              jellyfinConfig: {
                storageClass:
                  k8sWorkstationSystemContract.output.storageClasses
                    .longhornSsdRetain,
                size: '5Gi',
              },
              jellyfinMedia: {
                storageClass:
                  k8sWorkstationSystemContract.output.storageClasses
                    .longhornHddRetain,
                size: '2Ti',
              },
              jellyfinCache: {
                storageClass:
                  k8sWorkstationSystemContract.output.storageClasses
                    .longhornSsd,
                size: '10Gi',
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

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
