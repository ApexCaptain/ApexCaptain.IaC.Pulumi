/**
 * Workstation 클러스터의 "시스템" 스택.
 *
 * 네트워킹(Cilium) → 인증서(cert-manager) → Vault → Istio mesh → 스토리지(Longhorn)
 * → IdP(Authentik) 순으로 깔고, apps/tools 스택이 여기 output을 참조한다.
 *
 * 배포 순서가 꼬이기 쉬운 구간:
 * - Vault는 cert-manager CA에, mesh ingress는 LE wildcard cert에 의존
 * - Authentik PG는 Longhorn SSD SC에, Longhorn UI는 Authentik proxy에 의존
 *   → Longhorn↔Authentik 3단계 분리는 아래 JSDoc 참고
 */
import { authentik } from '@common/bridged-provider';
import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import * as kubernetes from '@pulumi/kubernetes';
import * as oci from '@pulumi/oci';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
import * as components from './components';

export const k8sWorkstationSystemContract = new nexus.classes.Contract(
  __filename,
  async () => {
    // ESC
    const commonEsc = nexus.esc.commonEsc;
    const projectEsc = nexus.esc.k8sWorkstationSystemEsc;

    const authentikNamespace = 'authentik';
    const authentikProxyOutpostName = 'authentik-proxy-outpost';
    const authentikProxyOutpostProviderName =
      'authentik-proxy-outpost-provider';

    // K8s Provider
    const workstationK8sProvider = new kubernetes.Provider(
      'workstationK8sProvider',
      {
        kubeconfig: nexus.esc.commonEsc.esc.workstationKubeconfig,
      },
    );

    // OCI Provider
    const ociProvider = new oci.Provider('ociProvider', {
      auth: nexus.esc.ociEsc.esc.auth,
      fingerprint: nexus.esc.ociEsc.esc.fingerprint,
      privateKey: nexus.esc.ociEsc.esc.privateKey,
      region: nexus.esc.ociEsc.esc.region,
      tenancyOcid: nexus.esc.ociEsc.esc.tenancyOcid,
      userOcid: nexus.esc.ociEsc.esc.userOcid,
    });

    // Cilium
    const ciliumResources = new components.cilium.CiliumResourcesComponent(
      'ciliumResources',
      {
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
    );

    // Cert Manager
    const certManagerHelmChart =
      new components.certManager.CertManagerHelmChartComponent(
        'certManagerHelmChart',
        {
          helm: {
            certManager: {
              version: 'v1.20.3',
              repositoryUrl:
                commonEsc.esc.helmRepositoryUrls['charts.jetstack.io'],
            },
          },
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
      );

    const certManagerResources =
      new components.certManager.CertManagerResourcesComponent(
        'certManagerResources',
        {
          namespace: certManagerHelmChart.output.namespace,
          cloudflareApiToken:
            cloudflareContract.secret.apexCaptainCloudflareApiToken,
          cloudflareEmail: cloudflareContract.secret.apexCaptainCloudflareEmail,
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
        { dependsOn: [certManagerHelmChart] },
      );

    // Vault — mesh 밖 Helm, IaC Provider는 ingress mesh 경유 (OIDC는 후속)
    const vaultKms = new components.vault.VaultKmsComponent('vaultKms', {
      tenancyOcid: nexus.esc.ociEsc.esc.tenancyOcid,
      region: nexus.esc.ociEsc.esc.region,
      providers: {
        oci: ociProvider,
      },
    });

    const vaultHelmChart = new components.vault.VaultHelmChartComponent(
      'vaultHelmChart',
      {
        helm: {
          vault: {
            version: '0.33.0',
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls['helm.releases.hashicorp.com'],
          },
        },
        kms: {
          oci: {
            keyId: vaultKms.secret.apply(secret => secret.kms.keyId),
            cryptoEndpoint: vaultKms.secret.apply(
              secret => secret.kms.cryptoEndpoint,
            ),
            managementEndpoint: vaultKms.secret.apply(
              secret => secret.kms.managementEndpoint,
            ),
          },
        },
        unsealAuth: vaultKms.secret.apply(secret => secret.unsealAuth),
        pvc: {
          server: {
            storageClass: commonEsc.esc.workstationLocalPathStorageClassName,
            size: '10Gi',
          },
        },
        bootstrapToken: {
          kubeconfig: commonEsc.esc.workstationKubeconfig,
          bootstrapTokenEncryptionKey:
            projectEsc.esc.vault.bootstrapTokenEncryptionKey,
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      { dependsOn: [vaultKms, certManagerHelmChart] },
    );

    // Istio
    // Jellyfin·qBittorrent SFTP — L4 direct gateway (HTTPS ingress와 별도 포트)
    const directGatewayPorts: utils.types.DeepPulumiInput<
      {
        name: string;
        port: number;
        protocol: string;
      }[]
    > = [
      {
        name: commonEsc.esc.istioNetwork.workstationDirectGateway
          .jellyfinSftpName,
        port: commonEsc.esc.istioNetwork.workstationDirectGateway
          .jellyfinSftpPort,
        protocol:
          commonEsc.esc.istioNetwork.workstationDirectGateway
            .jellyfinSftpProtocol,
      },
      {
        name: commonEsc.esc.istioNetwork.workstationDirectGateway
          .qbittorrentSftpName,
        port: commonEsc.esc.istioNetwork.workstationDirectGateway
          .qbittorrentSftpPort,
        protocol:
          commonEsc.esc.istioNetwork.workstationDirectGateway
            .qbittorrentSftpProtocol,
      },
    ];

    const istioHelmChart = new components.istio.IstioHelmChartComponent(
      'istioHelmChart',
      {
        helm: {
          istio: {
            version: '1.30.2',
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls[
                'istio-release.storage.googleapis.com/charts'
              ],
          },
        },
        meshId: commonEsc.esc.istioNetwork.meshId,
        workstationIpV4Address: commonEsc.esc.workstationIpV4Address,
        ingressGatewayIp: projectEsc.esc.loadbalancer.celium.ingressGatewayIp,
        topology: {
          clusterName: commonEsc.esc.istioNetwork.workstationClusterName,
          network: commonEsc.esc.istioNetwork.workstationClusterNetwork,
        },
        directGatewayPorts,
        authentik: {
          namespace: authentikNamespace,
          proxyOutpostName: authentikProxyOutpostName,
          proxyOutpostProviderName: authentikProxyOutpostProviderName,
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
    );

    const istioGateway = new components.istio.IstioGatewayComponent(
      'istioGateway',
      {
        namespace: istioHelmChart.output.namespace,
        apexCaptainCloudflareZoneName:
          cloudflareContract.output.zones.ayteneve93com.domain,
        letsEncryptProdClusterIssuerName:
          certManagerResources.output.letsEncryptProdClusterIssuerName,
        letsEncryptStagingClusterIssuerName:
          certManagerResources.output.letsEncryptStagingClusterIssuerName,
        istioIngressGatewayLabel:
          istioHelmChart.output.istioIngressGatewayLabel,
        directGatewayPorts,
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      {
        dependsOn: [certManagerResources, istioHelmChart],
      },
    );

    // PostgreSQL Operator
    const postgresqlOperatorHelmChart =
      new components.postgresqlOperator.PostgreSQLOperatorHelmChartComponent(
        'postgresqlOperatorHelmChart',
        {
          helm: {
            postgresqlOperator: {
              version: '0.29.0',
              repositoryUrl:
                commonEsc.esc.helmRepositoryUrls[
                  'cloudnative-pg.github.io/charts'
                ],
            },
          },
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
      );

    // Vault Service Mesh — 공개 ingress + TLS origination (Authentik OIDC 전 단계)
    const vaultServiceMesh = new components.vault.VaultServiceMeshComponent(
      'vaultServiceMesh',
      {
        namespace: vaultHelmChart.output.namespace,
        ingress: {
          istioNamespace: istioHelmChart.output.namespace,
          vault: {
            host: cloudflareContract.output.zones.ayteneve93com.records.vault,
            serviceHost: vaultHelmChart.output.tls.serverName,
            tlsServerName: vaultHelmChart.output.tls.serverName,
            gatewayPath: istioGateway.output.istioIngressGatewayPath,
            gatewayLabel: istioHelmChart.output.istioIngressGatewayLabel,
            port: vaultHelmChart.output.services.vault.ports.vault,
          },
        },
        vault: {
          bootstrapToken: vaultHelmChart.secret.apply(
            secret => secret.bootstrapToken.token,
          ),
          rootCaSecretName: vaultHelmChart.output.tls.rootCaSecretName,
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      {
        dependsOn: [istioGateway, vaultHelmChart, istioHelmChart],
      },
    );

    const vaultProvider = new vault.Provider(
      'vaultProvider',
      vaultServiceMesh.secret.apply(secret => secret.vaultProviderConfig),
      {
        dependsOn: [vaultServiceMesh],
      },
    );

    const vaultResources = new components.vault.VaultResourcesComponent(
      'vaultResources',
      {
        providers: {
          vault: vaultProvider,
        },
      },
      {
        dependsOn: [vaultHelmChart, vaultServiceMesh, vaultProvider],
      },
    );

    // Longhorn
    const longhornHelmChart =
      new components.longhorn.LonghornHelmChartComponent('longhornHelmChart', {
        helm: {
          longhorn: {
            version: '1.12.0',
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls['charts.longhorn.io'],
          },
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      });

    const longhornResources =
      new components.longhorn.LonghornResourcesComponent(
        'longhornResources',
        {
          namespace: longhornHelmChart.output.namespace,
          nodes: projectEsc.esc.longhorn.nodes,
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
        {
          dependsOn: [longhornHelmChart],
        },
      );

    // Authentik
    const authentikHelmChart =
      new components.authentik.AuthentikHelmChartComponent(
        'authentikHelmChart',
        {
          namespace: authentikNamespace,
          helm: {
            authentik: {
              version: '2026.5.3',
              repositoryUrl:
                commonEsc.esc.helmRepositoryUrls['charts.goauthentik.io'],
            },
          },
          secretKey: projectEsc.esc.authentik.secretKey,
          host: cloudflareContract.output.zones.ayteneve93com.records.auth,
          secrets: {
            bootstrap: {
              token: projectEsc.esc.authentik.bootstrap.token,
              email: projectEsc.esc.authentik.bootstrap.email,
              password: projectEsc.esc.authentik.bootstrap.password,
            },
            postgresqlPassword: projectEsc.esc.authentik.postgresqlPassword,
          },
          pvc: {
            postgresql: {
              storageClass: longhornResources.output.storageClasses.longhornSsd,
              size: '8Gi',
            },
          },
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
        {
          dependsOn: [longhornHelmChart, longhornResources],
        },
      );

    const authentikServiceMesh =
      new components.authentik.AuthentikServiceMeshComponent(
        'authentikServiceMesh',
        {
          namespace: authentikHelmChart.output.namespace,
          rootDomain: cloudflareContract.output.zones.ayteneve93com.domain,
          ingress: {
            authentikWebUi: {
              host: cloudflareContract.output.zones.ayteneve93com.records.auth,
              serviceName: authentikHelmChart.output.services.authentik.name,
              gatewayPath: istioGateway.output.istioIngressGatewayPath,
              port: authentikHelmChart.output.services.authentik.port.http,
            },
          },
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
        {
          dependsOn: [istioGateway, authentikHelmChart],
        },
      );

    const authentikProvider = new authentik.Provider(
      'authentikProvider',
      authentikHelmChart.secret.authentikProviderConfig,
      {
        dependsOn: [authentikHelmChart, authentikServiceMesh],
      },
    );

    /**
     * Longhorn ↔ Authentik 상호 의존으로 배포 순서·리소스 구성이 3단계로 나뉜다.
     *
     * - Authentik PostgreSQL PVC는 Longhorn storage class에 의존한다.
     * - Longhorn UI는 Authentik proxy outpost(Istio ext-authz)로 보호된다.
     * - Authentik Outpost 생성 API는 protocolProviders가 비어 있으면 거부한다.
     *
     * 따라서 한 component에 묶으면 Outpost ↔ ProviderProxy 순환 의존이 생긴다.
     * 아래 순서로 분리한다.
     *
     * 1. authentikResources — groups/flows/oauth/serviceConnection (Outpost 없음)
     * 2. longhornServiceMesh — ProviderProxy 등 앱별 Authentik·mesh 리소스
     * 3. authentikOutpost — longhorn provider를 bootstrap으로 Outpost 생성
     *
     * longhorn 이후 추가되는 proxy outpost 앱(tools/apps 등)은
     * OutpostProviderAttachment로 연결한다. Outpost.protocolProviders는
     * bootstrap만 담당하며, attachment로 붙은 provider drift는
     * AuthentikOutpostComponent의 ignoreChanges로 무시한다.
     */
    const authentikResources =
      new components.authentik.AuthentikResourcesComponent(
        'authentikResources',
        {
          oauth: {
            google: {
              clientId: projectEsc.esc.authentik.oauth.google.clientId,
              clientSecret: projectEsc.esc.authentik.oauth.google.clientSecret,
            },
          },
          providers: {
            authentik: authentikProvider,
          },
        },
        {
          dependsOn: [authentikServiceMesh, authentikHelmChart],
        },
      );

    const vaultAuthentik = new components.vault.VaultAuthentikComponent(
      'vaultAuthentik',
      {
        hosts: {
          vault: cloudflareContract.output.zones.ayteneve93com.records.vault,
          authentik: cloudflareContract.output.zones.ayteneve93com.records.auth,
        },
        authentik: {
          allowedGroupId: authentikResources.output.groupIds.systemUserGroup,
          flow: {
            authorizationFlowId:
              authentikResources.output.flow
                .defaultProviderAuthorizationImplicitConsentId,
            invalidationFlowId:
              authentikResources.output.flow.defaultInvalidationFlowId,
          },
        },
        providers: {
          vault: vaultProvider,
          authentik: authentikProvider,
        },
      },
      {
        dependsOn: [
          vaultHelmChart,
          vaultServiceMesh,
          authentikResources,
          authentikProvider,
          vaultResources,
        ],
      },
    );

    const longhornServiceMesh =
      new components.longhorn.LonghornServiceMeshComponent(
        'longhornServiceMesh',
        {
          namespace: longhornHelmChart.output.namespace,
          ingress: {
            istioNamespace: istioHelmChart.output.namespace,
            longhornFrontend: {
              host: cloudflareContract.output.zones.ayteneve93com.records
                .longhorn,
              serviceName:
                longhornHelmChart.output.services.longhornFrontend.name,
              gatewayPath: istioGateway.output.istioIngressGatewayPath,
              gatewayLabel: istioHelmChart.output.istioIngressGatewayLabel,
              port: longhornHelmChart.output.services.longhornFrontend.port
                .http,
            },
          },
          authentik: {
            allowedGroupId:
              authentikResources.output.groupIds.systemManagerGroup,
            proxyOutpostProviderName: authentikProxyOutpostProviderName,
            flow: {
              authorizationFlowId:
                authentikResources.output.flow
                  .defaultProviderAuthorizationImplicitConsentId,
              invalidationFlowId:
                authentikResources.output.flow.defaultInvalidationFlowId,
            },
          },
          providers: {
            kubernetes: workstationK8sProvider,
            authentik: authentikProvider,
          },
        },
      );

    const authentikOutpost = new components.authentik.AuthentikOutpostComponent(
      'authentikOutpost',
      {
        outposts: {
          proxy: {
            name: authentikProxyOutpostName,
            providerIds: [longhornServiceMesh.output.authentikProxyProviderId],
          },
        },
        host: cloudflareContract.output.zones.ayteneve93com.records.auth,
        serviceConnectionId:
          authentikResources.output.serviceConnections.localKubernetesClusterId,
        providers: {
          authentik: authentikProvider,
        },
      },
      {
        dependsOn: [longhornServiceMesh, authentikResources],
      },
    );

    return {
      output: pulumi.output({
        namespaces: {
          istio: istioHelmChart.output.namespace,
        },
        serviceMesh: {
          istioIngressGatewayLabel:
            istioHelmChart.output.istioIngressGatewayLabel,
        },
        serviceAccounts: {
          istioIngressGateway:
            istioHelmChart.output.istioIngressGatewayServiceAccountName,
        },
        gatewayPaths: {
          ingressGatewayPath: istioGateway.output.istioIngressGatewayPath,
          directGatewayPath: istioGateway.output.istioDirectGatewayPath,
        },
        storageClasses: longhornResources.output.storageClasses,
        authentik: {
          flow: authentikResources.output.flow,
          groupIds: authentikResources.output.groupIds,
          outposts: {
            proxy: {
              id: authentikOutpost.output.outpostIds.proxyOutpostId,
              providerName: authentikProxyOutpostProviderName,
            },
          },
        },
      }),
      secret: pulumi.secret({
        providerConfigs: {
          authentik: authentikHelmChart.secret.authentikProviderConfig,
          vault: vaultServiceMesh.secret.vaultProviderConfig,
        },
        vault: {
          oidcMountAccessor: vaultAuthentik.output.oidc.mountAccessor,
          kvMount: vaultResources.output.kv.mountPath,
        },
      }),
    };
  },
);
