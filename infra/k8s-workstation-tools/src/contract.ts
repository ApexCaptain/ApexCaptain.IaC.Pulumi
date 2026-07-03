/**
 * Workstation "도구" 스택 — qBittorrent 등
 *
 * NordLynx VPN sidecar로 트래픽을 터널 밖으로만 보내는 구조.
 * Web UI는 Longhorn과 같은 Authentik Proxy + OutpostProviderAttachment 패턴.
 */
import { authentik } from '@common/bridged-provider';
import * as nexus from '@common/nexus';
import * as utils from '@common/utils';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import { k8sWorkstationSystemContract } from '@infra/k8s-workstation-system/src/contract';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
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
    const vaultProvider = new vault.Provider(
      'vaultProvider',
      k8sWorkstationSystemContract.secret.providerConfigs.vault,
    );

    // Production Only Tools
    if (pulumi.getStack() === utils.enums.StackStage.PROD) {
      const vikunjaHost =
        cloudflareContract.output.zones.ayteneve93com.records.todo;
      const authentikHost =
        cloudflareContract.output.zones.ayteneve93com.records.auth;

      // Vikunja
      const vikunjaBase = new components.vikunja.VikunjaBaseComponent(
        'vikunjaBase',
        {
          pvc: {
            postgresqlCluster: {
              storageClass:
                k8sWorkstationSystemContract.output.storageClasses.longhornSsd,
              size: '8Gi',
            },
          },
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
      );

      const vikunjaAuthentik = new components.vikunja.VikunjaAuthentikComponent(
        'vikunjaAuthentik',
        {
          hosts: {
            vikunja: vikunjaHost,
            authentik: authentikHost,
          },
          oidcProviderKey: 'authentik',
          authentik: {
            allowedGroupId:
              k8sWorkstationSystemContract.output.authentik.groupIds
                .toolsUserGroup,
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
            authentik: authentikProvider,
          },
        },
      );

      const vikunjaHelmChart = new components.vikunja.VikunjaHelmChartComponent(
        'vikunjaHelmChart',
        {
          namespace: vikunjaBase.output.namespace,
          host: vikunjaHost,
          oidc: {
            providerKey: vikunjaAuthentik.output.oidc.providerKey,
            providerName: 'Login with Authentik',
            authUrl: vikunjaAuthentik.output.oidc.authUrl,
            scope: 'openid profile email',
            clientId: vikunjaAuthentik.secret.oidc.clientId,
            clientSecret: vikunjaAuthentik.secret.oidc.clientSecret,
          },
          postgresql: {
            database: vikunjaBase.secret.postgresqlDatabase,
            host: vikunjaBase.secret.postgresqlReadWriteFqdn,
            authSecret: {
              name: vikunjaBase.secret.postgresqlAuthSecretName,
              usernameKey: vikunjaBase.secret.postgresqlAuthSecretUsernameKey,
              passwordKey: vikunjaBase.secret.postgresqlAuthSecretPasswordKey,
            },
          },
          helm: {
            vikunja: {
              version: '0.16.0',
              repositoryUrl:
                commonEsc.esc.helmRepositoryUrls[
                  'go-vikunja/helm-chart/vikunja'
                ],
            },
          },
          pvc: {
            vikunja: {
              data: {
                storageClass:
                  k8sWorkstationSystemContract.output.storageClasses
                    .longhornSsd,
                size: '2Gi',
              },
            },
          },
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
        {
          dependsOn: [vikunjaBase, vikunjaAuthentik],
        },
      );

      const vikunjaServiceMesh =
        new components.vikunja.VikunjaServiceMeshComponent(
          'vikunjaServiceMesh',
          {
            namespace: vikunjaBase.output.namespace,
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
              vikunjaWebUi: {
                host: cloudflareContract.output.zones.ayteneve93com.records
                  .todo,
                serviceName: vikunjaHelmChart.output.services.vikunja.name,
                gatewayPath:
                  k8sWorkstationSystemContract.output.gatewayPaths
                    .ingressGatewayPath,
                port: vikunjaHelmChart.output.services.vikunja.port.webUi,
              },
            },
            providers: {
              kubernetes: workstationK8sProvider,
            },
          },
          {
            dependsOn: [vikunjaHelmChart],
          },
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
              k8sWorkstationSystemContract.output.gatewayPaths
                .directGatewayPath,
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
    }

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
