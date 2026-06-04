import * as nexus from '@common/nexus';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import { k8sWorkstationSystemContract } from '@infra/k8s-workstation-system/src/contract';
import * as authentik from '@pulumi/authentik';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as components from './components';

export const k8sWorkstationToolsContract = new nexus.classes.Contract(
  __filename,
  async () => {
    // K8s Provider
    const workstationK8sProvider = new kubernetes.Provider(
      'workstationK8sProvider',
      {
        kubeconfig: k8sWorkstationSystemContract.output.kubeConfigFilePath,
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
          netLocal:
            nexus.esc.commonEsc.esc.istioNetwork
              .workstationDefaultCalcioIpv4IpPoolsCidrBlock,
          privateKey: nexus.esc.commonEsc.esc.nordLynx.privateKey,
        },

        pvc: {
          qbittorrentConfig: {
            storageClass: k8sWorkstationSystemContract.output.storageClass.ssd0,
            size: '200Mi',
          },
          qbittorrentCompleteDownloads: {
            storageClass: k8sWorkstationSystemContract.output.storageClass.hdd0,
            size: '1Ti',
          },
          qbittorrentIncompleteDownloads: {
            storageClass: k8sWorkstationSystemContract.output.storageClass.ssd0,
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
            proxyOutpostProviderName:
              k8sWorkstationSystemContract.output.authentik
                .authentikProxyOutpostProviderName,
            flow: {
              authorizationFlowId:
                k8sWorkstationSystemContract.output.authentik.flow
                  .defaultProviderAuthorizationImplicitConsentId,
              invalidationFlowId:
                k8sWorkstationSystemContract.output.authentik.flow
                  .defaultInvalidationFlowId,
            },
            authorizationBypass: {
              ipBlocksToBypass:
                nexus.esc.k8sWorkstationToolsEsc.esc.qbittorrent.authentik
                  .authorizationBypass.ipBlocksToBypass,
            },
          },
          providers: {
            kubernetes: workstationK8sProvider,
            authentik: authentikProvider,
          },
        },
      );

    return {
      output: pulumi.output({
        authentik: {
          qbittorrentAuthentikProxyProviderId:
            qbittorrentServiceMesh.output.authentikProxyProviderId,
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
