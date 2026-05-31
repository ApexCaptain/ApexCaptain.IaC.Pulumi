import fs from 'fs';
import path from 'path';
import * as nexus from '@common/nexus';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import yaml from 'yaml';

import * as components from './components';

export const k8sWorkstationSystemContract = new nexus.classes.Contract(
  yaml.parse(fs.readFileSync(path.join(__dirname, '../Pulumi.yaml'), 'utf8'))
    .name,
  async () => {
    // ESC
    const commonEsc = nexus.esc.commonEsc;
    const projectEsc = nexus.esc.k8sWorkstationSystemEsc;

    // Pulumi Outputs
    const cloudflareProjectOutput = cloudflareContract.fetchOutput();
    const cloudflareProjectSecret = cloudflareContract.fetchSecret();

    // Kube Config
    const kubeConfig = new nexus.components.KubeConfigComponent('kubeConfig', {
      name: 'ws',
      fileDirPath: projectEsc.esc.kubeConfig.fileDirPath,
      clustser: {
        certificateAuthorityData:
          projectEsc.esc.kubeConfig.certificateAuthorityData,
        server: projectEsc.esc.kubeConfig.server,
      },
      user: {
        clientCertificateData: projectEsc.esc.kubeConfig.clientCertificateData,
        clientKeyData: projectEsc.esc.kubeConfig.clientKeyData,
      },
    });

    // K8s Provider
    const workstationK8sProvider = new kubernetes.Provider(
      'workstationK8sProvider',
      {
        kubeconfig: kubeConfig.output.kubeConfigFilePath,
      },
    );

    // Metrics Server
    const metricsServer = new components.MetricsServerComponent(
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
    const certManager = new components.certManager.CertManagerChartComponent(
      'certManager',
      {
        namespace: 'cert-manager',
        version: 'v1.20.2',
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
    );

    const certManagerResources =
      new components.certManager.CertManagerResourcesComponent(
        'certManagerResources',
        {
          namespace: certManager.output.namespace,
          cloudflareApiToken:
            cloudflareProjectSecret.apexCaptainCloudflareApiToken,
          cloudflareEmail: cloudflareProjectSecret.apexCaptainCloudflareEmail,
          providers: {
            kubernetes: workstationK8sProvider,
          },
        },
        { dependsOn: [certManager] },
      );

    // Istio
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
      providers: {
        kubernetes: workstationK8sProvider,
      },
    });

    return {
      output: pulumi.output({
        kubeConfigFilePath: kubeConfig.output.kubeConfigFilePath,
      }),
      secret: pulumi.secret({}),
    };
  },
);
