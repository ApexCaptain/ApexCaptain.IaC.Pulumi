import { authentik } from '@common/bridged-provider';
import * as nexus from '@common/nexus';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import { k8sWorkstationSystemContract } from '@infra/k8s-workstation-system/src/contract';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as components from './components';

export const k8sWorkstationToolsContract = new nexus.classes.Contract(
  __filename,
  async () => {
    // ESC
    const commonEsc = nexus.esc.commonEsc;
    const projectEsc = nexus.esc.k8sWorkstationToolsEsc;

    // K8s Provider
    const workstationK8sProvider = new kubernetes.Provider(
      'workstationK8sProvider',
      {
        kubeconfig: commonEsc.esc.workstationKubeconfig,
      },
    );

    // Authentik Provider
    const authentikProvider = new authentik.Provider(
      'authentikProvider',
      k8sWorkstationSystemContract.secret.providerConfigs.authentik,
    );

    // Qbittorrent
    const qbittorrentApp = new components.qbittorrent.QbittorrentAppComponent(
      'qbittorrentApp',
      {
        nordLynx: {
          allowedCidrBlocks: [
            commonEsc.esc.workstationPodsSubnetCidrBlock,
            commonEsc.esc.workstationServicesSubnetCidrBlock,
          ],
          privateKey: commonEsc.esc.nordLynx.privateKey,
        },
        sftpUserName: commonEsc.esc.adapter.sftp.userName,
        directGateway: {
          gatewayPath:
            k8sWorkstationSystemContract.output.gatewayPaths.directGatewayPath,
          qbitorrentSftp: {
            port: commonEsc.esc.istioNetwork.workstationDirectGateway
              .qbittorrentSftpPort,
          },
        },

        pvc: {
          qbittorrentModCache: {
            storageClass:
              k8sWorkstationSystemContract.output.storageClasses.longhornSsd,
            size: '100Mi',
          },
          qbittorrentConfig: {
            storageClass:
              k8sWorkstationSystemContract.output.storageClasses.longhornSsd,
            size: '200Mi',
          },
          qbittorrentCompleteDownloads: {
            storageClass:
              k8sWorkstationSystemContract.output.storageClasses.longhornHdd,
            size: '1Ti',
          },
          qbittorrentIncompleteDownloads: {
            storageClass:
              k8sWorkstationSystemContract.output.storageClasses.longhornSsd,
            size: '300Gi',
          },
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
    );

    const qbittorrentServiceMesh =
      new components.qbittorrent.QbittorrentServiceMeshComponent(
        'qbittorrentServiceMesh',
        {
          namespace: qbittorrentApp.output.namespace,
          ingress: {
            istioNamespace:
              k8sWorkstationSystemContract.output.namespaces.istio,
            qbittorrentWebUi: {
              host: cloudflareContract.output.zones.ayteneve93com.records
                .torrent,
              serviceName: qbittorrentApp.output.services.qbittorrent.name,
              gatewayPath:
                k8sWorkstationSystemContract.output.gatewayPaths
                  .ingressGatewayPath,
              gatewayLabel:
                k8sWorkstationSystemContract.output.serviceMesh
                  .istioIngressGatewayLabel,
              port: qbittorrentApp.output.services.qbittorrent.port.webUi,
            },
          },
          authentik: {
            allowedGroupId:
              k8sWorkstationSystemContract.output.authentik.groupIds
                .toolsManagerGroup,
            proxyOutpostId:
              k8sWorkstationSystemContract.output.authentik.outposts.proxy.id,
            proxyOutpostProviderName:
              k8sWorkstationSystemContract.output.authentik.outposts.proxy
                .providerName,
            flow: {
              authorizationFlowId:
                k8sWorkstationSystemContract.output.authentik.flow
                  .defaultProviderAuthorizationImplicitConsentId,
              invalidationFlowId:
                k8sWorkstationSystemContract.output.authentik.flow
                  .defaultInvalidationFlowId,
            },
          },
          providers: {
            kubernetes: workstationK8sProvider,
            authentik: authentikProvider,
          },
        },
      );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
