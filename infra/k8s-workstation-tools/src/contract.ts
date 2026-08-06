/**
 * Workstation "도구" 스택 — qBittorrent 등
 *
 * NordLynx VPN sidecar로 트래픽을 터널 밖으로만 보내는 구조.
 * Web UI는 Longhorn과 같은 Authentik Proxy + OutpostProviderAttachment 패턴.
 */
import { authentik, coderd } from '@common/bridged-provider';
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
      const coderHost =
        cloudflareContract.output.zones.ayteneve93com.records.coder;
      const vaultHost =
        k8sWorkstationSystemContract.output.vault.host;
      const vikunjaHost =
        cloudflareContract.output.zones.ayteneve93com.records.todo;
      const authentikHost =
        cloudflareContract.output.zones.ayteneve93com.records.auth;

      // Coder
      const coderBase = new components.coder.CoderBaseComponent('coderBase', {
        pvc: {
          postgresqlCluster: {
            storageClass:
              k8sWorkstationSystemContract.output.storageClasses.longhornSsd,
            size: '10Gi',
          },
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      });
      const coderAuthentik = new components.coder.CoderAuthentikComponent(
        'coderAuthentik',
        {
          hosts: {
            coder: coderHost,
            authentik: authentikHost,
          },
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
      const coderHelmChart = new components.coder.CoderHelmChartComponent(
        'coderHelmChart',
        {
          namespace: coderBase.output.namespace,
          host: coderHost,
          adminUser: {
            email: projectEsc.esc.coder.firstUser.email,
            username: projectEsc.esc.coder.firstUser.username,
            fullName: projectEsc.esc.coder.firstUser.fullName,
            password: projectEsc.esc.coder.firstUser.password,
          },
          oidc: {
            issuerUrl: coderAuthentik.output.oidc.issuerUrl,
            clientId: coderAuthentik.secret.oidc.clientId,
            clientSecret: coderAuthentik.secret.oidc.clientSecret,
          },
          externalAuth: {
            github: {
              clientId: projectEsc.esc.coder.githubApp.clientId,
              clientSecret: projectEsc.esc.coder.githubApp.clientSecret,
            },
          },
          postgresql: {
            urlSecret: {
              name: coderBase.secret.postgresqlUrlSecretName,
              key: coderBase.secret.postgresqlUrlSecretKey,
            },
          },
          helm: {
            coder: {
              version: '2.36.0',
              repositoryUrl:
                commonEsc.esc.helmRepositoryUrls['helm.coder.com/v2'],
            },
          },
          workspaceNamespaces: [
            coderBase.output.sysboxUbuntuNamespace,
            coderBase.output.sysboxUbuntuTestNamespace,
          ],
          adminApiToken: {
            kubeconfig: commonEsc.esc.workstationKubeconfig,
          },
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
        {
          dependsOn: [coderBase, coderAuthentik],
        },
      );

      const coderServiceMesh = new components.coder.CoderServiceMeshComponent(
        'coderServiceMesh',
        {
          namespace: coderBase.output.namespace,
          authorizationPolicy: {
            from: {
              istioIngress: {
                namespace: k8sWorkstationSystemContract.output.namespaces.istio,
                serviceAccountName:
                  k8sWorkstationSystemContract.output.serviceAccounts
                    .istioIngressGateway,
              },
              allowedNamespaces: [
                coderBase.output.sysboxUbuntuNamespace,
                coderBase.output.sysboxUbuntuTestNamespace,
              ],
            },
          },
          adminApiToken: {
            token: coderHelmChart.secret.adminApiToken.token,
            organizationId: coderHelmChart.secret.adminApiToken.organizationId,
          },
          ingress: {
            coderWebUi: {
              host: coderHost,
              serviceName: coderHelmChart.output.services.coder.name,
              gatewayPath:
                k8sWorkstationSystemContract.output.gatewayPaths
                  .ingressGatewayPath,
              port: coderHelmChart.output.services.coder.port.http,
            },
          },
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
        {
          dependsOn: [coderHelmChart],
        },
      );

      const coderdProvider = new coderd.Provider(
        'coderdProvider',
        {
          url: coderServiceMesh.secret.coderdProviderConfig.url,
          token: coderServiceMesh.secret.coderdProviderConfig.token,
          defaultOrganizationId:
            coderServiceMesh.secret.coderdProviderConfig.defaultOrganizationId,
        },
        {
          dependsOn: [coderServiceMesh],
        },
      );

      new components.coder.CoderResourcesComponent(
        'coderResources',
        {
          templateVariables: {
            sysboxUbuntu: {
              namespace: coderBase.output.sysboxUbuntuNamespace,
              runtimeClassName:
                k8sWorkstationSystemContract.output.sysbox.runtimeClassName,
              storageClassName:
                k8sWorkstationSystemContract.output.storageClasses.longhornSsd,
              lxcfsHostMountPath:
                k8sWorkstationSystemContract.output.lxcfs.mountPath,
              devicePluginFuseKey: pulumi.interpolate`${k8sWorkstationSystemContract.output.genericDevicePlugin.deviceDomain}/fuse`,
              meshProxy: {
                host: coderBase.output.meshProxies.sysboxUbuntu.host,
                port: coderBase.output.meshProxies.sysboxUbuntu.port,
                url: coderBase.output.meshProxies.sysboxUbuntu.url,
              },
              vault: {
                addr: pulumi.interpolate`https://${vaultHost}`,
                jwtAuthPath:
                  k8sWorkstationSystemContract.output.vault.coderJwt.mountPath,
                jwtRole:
                  k8sWorkstationSystemContract.output.vault.coderJwt.roleName,
              },
            },
            sysboxUbuntuTest: {
              namespace: coderBase.output.sysboxUbuntuTestNamespace,
              runtimeClassName:
                k8sWorkstationSystemContract.output.sysbox.runtimeClassName,
              storageClassName:
                k8sWorkstationSystemContract.output.storageClasses.longhornSsd,
              lxcfsHostMountPath:
                k8sWorkstationSystemContract.output.lxcfs.mountPath,
              devicePluginFuseKey: pulumi.interpolate`${k8sWorkstationSystemContract.output.genericDevicePlugin.deviceDomain}/fuse`,
              meshProxy: {
                host: coderBase.output.meshProxies.sysboxUbuntuTest.host,
                port: coderBase.output.meshProxies.sysboxUbuntuTest.port,
                url: coderBase.output.meshProxies.sysboxUbuntuTest.url,
              },
              vault: {
                addr: pulumi.interpolate`https://${vaultHost}`,
                jwtAuthPath:
                  k8sWorkstationSystemContract.output.vault.coderJwt.mountPath,
                jwtRole:
                  k8sWorkstationSystemContract.output.vault.coderJwt.roleName,
              },
            },
          },
          providers: {
            coderd: coderdProvider,
          },
        },
        {
          dependsOn: [coderBase, coderdProvider],
        },
      );

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
