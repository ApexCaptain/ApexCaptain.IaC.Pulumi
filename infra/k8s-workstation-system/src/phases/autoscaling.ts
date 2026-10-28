import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import * as components from '../components';
import { AuthentikPhase, AuthentikOutpostPhase } from './authentik';
import { authentikNames } from './constants';
import { MeshPhase } from './mesh';
import { SystemProviders } from './providers';

/** VPA (recommender only) + Goldilocks dashboard. 대시보드는 Authentik proxy outpost 뒤. */
export const deployAutoscaling = (deps: {
  providers: SystemProviders;
  mesh: MeshPhase;
  authentik: AuthentikPhase;
  authentikOutpost: AuthentikOutpostPhase;
}) => {
  const commonEsc = nexus.esc.commonEsc;
  const { workstationK8sProvider } = deps.providers;
  const { istioHelmChart, istioGateway } = deps.mesh;
  const { authentikResources, authentikProvider } = deps.authentik;
  const { authentikOutpost } = deps.authentikOutpost;

  const vpaHelmChart = new components.vpa.VpaHelmChartComponent(
    'vpaHelmChart',
    {
      helm: {
        vpa: {
          version: utils.configs.helmChartVersions.vpa,
          repositoryUrl:
            commonEsc.esc.helmRepositoryUrls['charts.fairwinds.com/stable'],
        },
      },
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
  );

  const goldilocksHelmChart =
    new components.goldilocks.GoldilocksHelmChartComponent(
      'goldilocksHelmChart',
      {
        helm: {
          goldilocks: {
            version: utils.configs.helmChartVersions.goldilocks,
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls['charts.fairwinds.com/stable'],
          },
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      { dependsOn: [vpaHelmChart] },
    );

  new components.goldilocks.GoldilocksServiceMeshComponent(
    'goldilocksServiceMesh',
    {
      namespace: goldilocksHelmChart.output.namespace,
      ingress: {
        istioNamespace: istioHelmChart.output.namespace,
        goldilocksDashboard: {
          host: cloudflareContract.output.zones.ayteneve93com.records
            .goldilocks,
          serviceName:
            goldilocksHelmChart.output.services.goldilocksDashboard.name,
          gatewayPath: istioGateway.output.istioIngressGatewayPath,
          gatewayLabel: istioHelmChart.output.istioIngressGatewayLabel,
          port: goldilocksHelmChart.output.services.goldilocksDashboard.port
            .http,
        },
      },
      authentik: {
        allowedGroupId: authentikResources.output.groupIds.systemUserGroup,
        proxyOutpostId: authentikOutpost.output.outpostIds.proxyOutpostId,
        proxyOutpostProviderName: authentikNames.proxyOutpostProviderName,
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
    {
      dependsOn: [istioGateway, goldilocksHelmChart, authentikOutpost],
    },
  );

  return { vpaHelmChart, goldilocksHelmChart };
};
