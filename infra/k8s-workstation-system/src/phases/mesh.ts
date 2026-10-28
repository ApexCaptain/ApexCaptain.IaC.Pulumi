import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import * as components from '../components';
import { CertManagerPhase } from './cert-manager';
import { authentikNames } from './constants';
import { SystemProviders } from './providers';

/** Istio ambient + ingress/direct gateway. ingress는 LE wildcard cert에 의존한다. */
export const deployMesh = (deps: {
  providers: SystemProviders;
  certManager: CertManagerPhase;
}) => {
  const commonEsc = nexus.esc.commonEsc;
  const projectEsc = nexus.esc.k8sWorkstationSystemEsc;
  const { workstationK8sProvider } = deps.providers;
  const { certManagerResources } = deps.certManager;

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
          version: utils.configs.helmChartVersions.istio,
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
        namespace: authentikNames.namespace,
        proxyOutpostName: authentikNames.proxyOutpostName,
        proxyOutpostProviderName: authentikNames.proxyOutpostProviderName,
      },
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
  );

  new components.istio.IstioCniRebootRepairComponent(
    'istioCniRebootRepair',
    {
      namespace: istioHelmChart.output.namespace,
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
    { dependsOn: [istioHelmChart] },
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
      istioIngressGatewayLabel: istioHelmChart.output.istioIngressGatewayLabel,
      directGatewayPorts,
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
    {
      dependsOn: [certManagerResources, istioHelmChart],
    },
  );

  return { istioHelmChart, istioGateway };
};

export type MeshPhase = ReturnType<typeof deployMesh>;
