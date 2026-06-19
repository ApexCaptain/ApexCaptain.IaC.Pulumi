import { authentik } from '@common/bridged-provider';
import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import * as kubernetes from '@pulumi/kubernetes';
import * as oci from '@pulumi/oci';
import * as pulumi from '@pulumi/pulumi';
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
              version: 'v1.20.2',
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

    // Istio
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
            version: '1.30.1',
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
          allowedEmails: projectEsc.esc.authentik.oauth.allowedEmails,
          providers: {
            authentik: authentikProvider,
          },
        },
        {
          dependsOn: [authentikServiceMesh, authentikHelmChart],
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

    // Vault
    /*
    const vaultKms = new components.vault.VaultKmsComponent('vaultKms', {
      tenancyOcid: nexus.esc.ociEsc.esc.tenancyOcid,
      providers: {
        oci: ociProvider,
      },
    });

    const vaultCoreHelmChart = new components.vault.VaultCoreHelmChartComponent(
      'vaultCoreHelmChart',
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
            keyId: vaultKms.secret.keyId,
            cryptoEndpoint: vaultKms.secret.cryptoEndpoint,
            managementEndpoint: vaultKms.secret.managementEndpoint,
          },
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      {
        dependsOn: [certManagerHelmChart, vaultKms],
      },
    );
    */

    // Test
    // const test = new components.test.TestComponent(
    //   'test',
    //   {
    //     ingress: {
    //       test1: {
    //         host: cloudflareContract.output.zones.ayteneve93com.records.test,
    //         gatewayPath: istioGateway.output.istioIngressGatewayPath,
    //       },
    //     },
    //     providers: {
    //       kubernetes: workstationK8sProvider,
    //     },
    //   },
    //   {
    //     dependsOn: [istioHelmChart],
    //   },
    // );

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
          serviceConnections: authentikResources.output.serviceConnections,
          flow: authentikResources.output.flow,
          groupIds: authentikResources.output.groupIds,
          authentikProxyOutpostName,
          authentikProxyOutpostProviderName,
          longhornAuthentikProxyProviderId:
            longhornServiceMesh.output.authentikProxyProviderId,
        },
      }),
      secret: pulumi.secret({
        providerConfigs: {
          authentik: authentikHelmChart.secret.authentikProviderConfig,
        },
      }),
    };
  },
);
