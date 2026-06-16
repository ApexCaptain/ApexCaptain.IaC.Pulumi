import { authentik } from '@common/bridged-provider';
import * as customResources from '@common/custom-resources';
import * as nexus from '@common/nexus';
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

    // Kube Config
    // const kubeConfig = new customResources.resources.k8s.KubeConfigFileV1(
    //   'kubeConfig',
    //   {
    //     name: 'ws',
    //     clustser: {
    //       certificateAuthorityData:
    //         projectEsc.esc.kubeConfig.certificateAuthorityData,
    //       server: projectEsc.esc.kubeConfig.server,
    //     },
    //     user: {
    //       clientCertificateData:
    //         projectEsc.esc.kubeConfig.clientCertificateData,
    //       clientKeyData: projectEsc.esc.kubeConfig.clientKeyData,
    //     },
    //   },
    // );

    /*
    const authentikNamespace = 'authentik';
    const authentikProxyOutpostName = 'authentik-proxy-outpost';
    const authentikProxyOutpostProviderName =
      'authentik-proxy-outpost-provider';

    // K8s Provider
    const workstationK8sProvider = new kubernetes.Provider(
      'workstationK8sProvider',
      {
        kubeconfig: kubeConfig.filePath,
      },
      {
        dependsOn: [kubeConfig],
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

    // Metrics Server
    const metricsServerHelmChart =
      new components.metricsServer.MetricsServerHelmChartComponent(
        'metricsServerHelmChart',
        {
          helm: {
            metricsServer: {
              version: '3.13.0',
              repositoryUrl:
                commonEsc.esc.helmRepositoryUrls[
                  'kubernetes-sigs.github.io/metrics-server'
                ],
            },
          },
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
      );

    // Metallb
    const metallbHelmChart = new components.metallb.MetallbHelmChartComponent(
      'metallbHelmChart',
      {
        helm: {
          metallb: {
            version: '0.16.1',
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls['metallb.github.io/metallb'],
          },
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
    );

    const metallbResources = new components.metallb.MetallbResourcesComponent(
      'metallbResources',
      {
        namespace: metallbHelmChart.output.namespace,
        ipRange: projectEsc.esc.loadbalancer.metallb.ipRange,
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      { dependsOn: [metallbHelmChart] },
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
    const additionalPorts = [
      {
        name: 'nfs-sftp',
        port: projectEsc.esc.loadbalancer.metallb.additionalPort.nfsSftp,
        protocol: 'TCP',
        description: 'NFS SFTP Port',
      },
    ];

    const istioHelmChart = new components.istio.IstioHelmChartComponent(
      'istioHelmChart',
      {
        helm: {
          istio: {
            version: '1.30.0',
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls[
                'istio-release.storage.googleapis.com/charts'
              ],
          },
        },
        meshId: commonEsc.esc.istioNetwork.meshId,
        workstationIpV4Address: commonEsc.esc.workstationIpV4Address,
        ingressGatewayIp: projectEsc.esc.loadbalancer.metallb.ingressGatewayIp,
        topology: {
          clusterName: commonEsc.esc.istioNetwork.workstationClusterName,
          network: commonEsc.esc.istioNetwork.workstationClusterNetwork,
        },
        additionalPorts,
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
        additionalPorts,
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      {
        dependsOn: [metallbResources, certManagerResources, istioHelmChart],
      },
    );

    // Local NFS Provisioner
    const localNfsProvisionerBase =
      new components.localNfsProvisioner.LocalNfsProvisionerBaseComponent(
        'localNfsProvisionerBase',
        {
          nodes: {
            node0: {
              hostName: projectEsc.esc.nodes.node0.hostName,
            },
          },
          hostPath: {
            localPathHdd0: projectEsc.esc.nfs.localPathHdd0,
            localPathSsd0: projectEsc.esc.nfs.localPathSsd0,
            diskSizeHdd0: projectEsc.esc.nfs.diskSizeHdd0,
            diskSizeSsd0: projectEsc.esc.nfs.diskSizeSsd0,
          },
          sftp: {
            userName: projectEsc.esc.nfs.sftp.userName,
            externalPort:
              projectEsc.esc.loadbalancer.metallb.additionalPort.nfsSftp,
          },
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
        {
          dependsOn: [istioGateway],
        },
      );

    const localNfsProvisionerServiceMesh =
      new components.localNfsProvisioner.LocalNfsProvisionerServiceMeshComponent(
        'localNfsProvisionerServiceMesh',
        {
          namespace: localNfsProvisionerBase.output.namespace,
          directConnection: {
            nfsSftp: {
              serviceName: localNfsProvisionerBase.output.services.sftp.name,
              gatewayPath: istioGateway.output.istioDirectGatewayPath,
              externalPort:
                projectEsc.esc.loadbalancer.metallb.additionalPort.nfsSftp,
              servicePort:
                localNfsProvisionerBase.output.services.sftp.port.sftp,
            },
          },
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
        {
          dependsOn: [localNfsProvisionerBase],
        },
      );

    const localNfsProvisionerHelmChart =
      new components.localNfsProvisioner.LocalNfsProvisionerHelmChartComponent(
        'localNfsProvisionerHelmChart',
        {
          namespace: localNfsProvisionerBase.output.namespace,
          helm: {
            localNfsProvisioner: {
              version: '4.0.18',
              repositoryUrl:
                commonEsc.esc.helmRepositoryUrls[
                  'kubernetes-sigs.github.io/nfs-subdir-external-provisioner'
                ],
            },
          },
          nfsSharedServiceDirName:
            localNfsProvisionerBase.output.nfsSharedServiceDirName,
          internalNfsServerIp:
            localNfsProvisionerBase.output.internalNfsServerIp,
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
        {
          dependsOn: [localNfsProvisionerBase],
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
              version: '2026.5.2',
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
            redisPassword: projectEsc.esc.authentik.redisPassword,
          },
          pvc: {
            postgresql: {
              storageClass:
                localNfsProvisionerHelmChart.output.storageClass.ssd0,
              size: '8Gi',
            },
            redis: {
              storageClass:
                localNfsProvisionerHelmChart.output.storageClass.ssd0,
              size: '1Gi',
            },
          },
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
        {
          dependsOn: [localNfsProvisionerHelmChart],
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
          isFirstDeploy: false,
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
      */

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
    /*
    const test = new components.test.TestComponent(
      'test',
      {
        namespace: 'test',
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      {
        dependsOn: [istioHelmChart],
      },
    );
    */

    return {
      output: pulumi.output({
        // kubeConfigFilePath: kubeConfig.filePath,
        // namespaces: {
        //   istio: istioHelmChart.output.namespace,
        // },
        // serviceMesh: {
        //   istioIngressGatewayLabel:
        //     istioHelmChart.output.istioIngressGatewayLabel,
        // },
        // serviceAccounts: {
        //   istioIngressGateway:
        //     istioHelmChart.output.istioIngressGatewayServiceAccountName,
        // },
        // gatewayPaths: {
        //   ingressGatewayPath: istioGateway.output.istioIngressGatewayPath,
        // },
        // storageClass: localNfsProvisionerHelmChart.output.storageClass,
        // authentik: {
        //   serviceConnections: authentikResources.output.serviceConnections,
        //   flow: authentikResources.output.flow,
        //   groupIds: authentikResources.output.groupIds,
        //   authentikProxyOutpostName,
        //   authentikProxyOutpostProviderName,
        // },
      }),
      secret: pulumi.secret({
        // providerConfigs: {
        //   authentik: authentikHelmChart.secret.authentikProviderConfig,
        // },
      }),
    };
  },
);
