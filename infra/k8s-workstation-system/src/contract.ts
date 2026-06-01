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

    const istioGateway = new components.istio.IstioGatewayComponent(
      'istioGateway',
      {
        namespace: istio.output.namespace,
        apexCaptainCloudflareZoneName:
          cloudflareProjectOutput.zones.ayteneve93com.domain,
        letsEncryptProdClusterIssuerName:
          certManagerResources.output.letsEncryptProdClusterIssuerName,
        letsEncryptStagingClusterIssuerName:
          certManagerResources.output.letsEncryptStagingClusterIssuerName,
        istioIngressGatewayLabel: istio.output.istioIngressGatewayLabel,
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      {
        dependsOn: [metallbResources, certManagerResources, istio],
      },
    );

    // Test
    const testDeployment = new kubernetes.apps.v1.Deployment(
      'testDeployment',
      {
        metadata: {
          name: 'test',
          namespace: 'default',
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: {
              app: 'test',
            },
          },
          template: {
            metadata: {
              labels: {
                app: 'test',
              },
            },
            spec: {
              containers: [{ name: 'test', image: 'nginx:latest' }],
            },
          },
        },
      },
      {
        provider: workstationK8sProvider,
      },
    );

    const testService = new kubernetes.core.v1.Service(
      'testService',
      {
        metadata: {
          name: 'test',
          namespace: 'default',
        },
        spec: {
          selector: {
            app: 'test',
          },
          ports: [{ name: 'http', port: 80, targetPort: 80 }],
        },
      },
      {
        provider: workstationK8sProvider,
      },
    );

    const testVirtualService = new nexus.crd.istio.VirtualServiceV1Crd(
      'testVirtualService',
      {
        metadata: {
          name: 'test',
          namespace: 'default',
        },
        spec: {
          hosts: [cloudflareProjectOutput.zones.ayteneve93com.records.jellyfin],
          gateways: [istioGateway.output.istioIngressGatewayPath],
          http: [
            {
              route: [
                {
                  destination: {
                    host: testService.metadata.name,
                    port: {
                      number: 80,
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      {
        provider: workstationK8sProvider,
      },
    );

    return {
      output: pulumi.output({
        kubeConfigFilePath: kubeConfig.output.kubeConfigFilePath,
      }),
      secret: pulumi.secret({}),
    };
  },
);
