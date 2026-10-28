import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import * as components from '../components';
import { AuthentikPhase } from './authentik';
import { authentikNames } from './constants';
import { MeshPhase } from './mesh';
import { SystemProviders } from './providers';

/** Longhorn 엔진 + StorageClass·노드 디스크. UI 노출은 `deployLonghornServiceMesh` (Authentik 이후). */
export const deployLonghorn = (deps: { providers: SystemProviders }) => {
  const commonEsc = nexus.esc.commonEsc;
  const projectEsc = nexus.esc.k8sWorkstationSystemEsc;
  const { workstationK8sProvider } = deps.providers;

  const longhornHelmChart = new components.longhorn.LonghornHelmChartComponent(
    'longhornHelmChart',
    {
      helm: {
        longhorn: {
          version: utils.configs.helmChartVersions.longhorn,
          repositoryUrl: commonEsc.esc.helmRepositoryUrls['charts.longhorn.io'],
        },
      },
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
  );

  const longhornResources = new components.longhorn.LonghornResourcesComponent(
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

  return { longhornHelmChart, longhornResources };
};

export type LonghornPhase = ReturnType<typeof deployLonghorn>;

/** Longhorn UI — ingress + Authentik ProviderProxy. Outpost bootstrap provider가 된다. */
export const deployLonghornServiceMesh = (deps: {
  providers: SystemProviders;
  longhorn: LonghornPhase;
  mesh: MeshPhase;
  authentik: AuthentikPhase;
}) => {
  const { workstationK8sProvider } = deps.providers;
  const { longhornHelmChart } = deps.longhorn;
  const { istioHelmChart, istioGateway } = deps.mesh;
  const { authentikResources, authentikProvider } = deps.authentik;

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
            port: longhornHelmChart.output.services.longhornFrontend.port.http,
          },
        },
        authentik: {
          allowedGroupId: authentikResources.output.groupIds.systemManagerGroup,
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
    );

  return { longhornServiceMesh };
};

export type LonghornServiceMeshPhase = ReturnType<
  typeof deployLonghornServiceMesh
>;
