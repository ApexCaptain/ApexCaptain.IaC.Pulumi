import * as customResources from '@common/custom-resources';
import * as nexus from '@common/nexus';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as components from './components';

export const k8sWorkstationSystemContract = new nexus.classes.Contract(
  __filename,
  async () => {
    // ESC
    const commonEsc = nexus.esc.commonEsc;
    const projectEsc = nexus.esc.k8sWorkstationSystemEsc;

    // Kube Config
    const kubeConfig = new customResources.resources.k8s.KubeConfigFileV1(
      'kubeConfig',
      {
        name: 'ws',
        clustser: {
          certificateAuthorityData:
            projectEsc.esc.kubeConfig.certificateAuthorityData,
          server: projectEsc.esc.kubeConfig.server,
        },
        user: {
          clientCertificateData:
            projectEsc.esc.kubeConfig.clientCertificateData,
          clientKeyData: projectEsc.esc.kubeConfig.clientKeyData,
        },
      },
    );

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

    // Metrics Server
    const metricsServer =
      new components.metricsServer.MetricsServerHelmChartComponent(
        'metricsServer',
        {
          namespace: 'metrics-server',
          version: '3.13.0',
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
      );

    // Metallb
    const metallb = new components.metallb.MetallbHelmChartComponent(
      'metallb',
      {
        namespace: 'metallb-system',
        version: '0.16.1',
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
    );

    const metallbResources = new components.metallb.MetallbResourcesComponent(
      'metallbResources',
      {
        namespace: metallb.output.namespace,
        ipRange: projectEsc.esc.loadbalancer.metallb.ipRange,
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      { dependsOn: [metallb] },
    );

    // Cert Manager
    const certManager =
      new components.certManager.CertManagerHelmChartComponent('certManager', {
        namespace: 'cert-manager',
        version: 'v1.20.2',
        providers: {
          kubernetes: workstationK8sProvider,
        },
      });

    const certManagerResources =
      new components.certManager.CertManagerResourcesComponent(
        'certManagerResources',
        {
          namespace: certManager.output.namespace,
          cloudflareApiToken:
            cloudflareContract.secret.apexCaptainCloudflareApiToken,
          cloudflareEmail: cloudflareContract.secret.apexCaptainCloudflareEmail,
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
        { dependsOn: [certManager] },
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

    const istio = new components.istio.IstioHelmChartComponent('istio', {
      namespace: 'istio-system',
      version: '1.30.0',
      meshId: commonEsc.esc.istioNetwork.meshId,
      workstationIpV4Address: commonEsc.esc.workstationIpV4Address,
      ingressGatewayIp: projectEsc.esc.loadbalancer.metallb.ingressGatewayIp,
      topology: {
        clusterName: commonEsc.esc.istioNetwork.workstationClusterName,
        network: commonEsc.esc.istioNetwork.workstationClusterNetwork,
      },
      additionalPorts,
      providers: {
        kubernetes: workstationK8sProvider,
      },
    });

    const istioGateway = new components.istio.IstioGatewayComponent(
      'istioGateway',
      {
        namespace: istio.output.namespace,
        apexCaptainCloudflareZoneName:
          cloudflareContract.output.zones.ayteneve93com.domain,
        letsEncryptProdClusterIssuerName:
          certManagerResources.output.letsEncryptProdClusterIssuerName,
        letsEncryptStagingClusterIssuerName:
          certManagerResources.output.letsEncryptStagingClusterIssuerName,
        istioIngressGatewayLabel: istio.output.istioIngressGatewayLabel,
        additionalPorts,
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      {
        dependsOn: [metallbResources, certManagerResources, istio],
      },
    );

    // Local NFS Provisioner
    const localNfsProvisionerBase =
      new components.localNfsProvisioner.LocalNfsProvisionerBaseComponent(
        'localNfsProvisionerBase',
        {
          namespace: 'local-nfs-provisioner',
          nodes: {
            node0: {
              hostName: projectEsc.esc.nodes.node0.hostName,
            },
          },
          directGatewayPath: istioGateway.output.istioDirectGatewayPath,
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

    const localNfsProvisionerHelmChart =
      new components.localNfsProvisioner.LocalNfsProvisionerHelmChartComponent(
        'localNfsProvisionerHelmChart',
        {
          namespace: localNfsProvisionerBase.output.namespace,
          version: '4.0.18',
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

    return {
      output: pulumi.output({
        kubeConfigFilePath: kubeConfig.filePath,
        gatewayPaths: {
          ingressGatewayPath: istioGateway.output.istioIngressGatewayPath,
        },
        storageClass: localNfsProvisionerHelmChart.output.storageClass,
      }),
      secret: pulumi.secret({}),
    };
  },
);
