import { authentik } from '@common/bridged-provider';
import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import * as components from '../components';
import { authentikNames } from './constants';
import { DataOperatorsPhase } from './data-operators';
import { LonghornPhase, LonghornServiceMeshPhase } from './longhorn';
import { MeshPhase } from './mesh';
import { SystemProviders } from './providers';

/**
 * Authentik 서버(CNPG on Longhorn SSD) + ingress + IaC Provider + groups/flows/oauth/serviceConnection.
 * Outpost는 만들지 않는다 — contract의 Longhorn ↔ Authentik 3단계 설명 참고.
 */
export const deployAuthentik = (deps: {
  providers: SystemProviders;
  longhorn: LonghornPhase;
  dataOperators: DataOperatorsPhase;
  mesh: MeshPhase;
}) => {
  const commonEsc = nexus.esc.commonEsc;
  const projectEsc = nexus.esc.k8sWorkstationSystemEsc;
  const { workstationK8sProvider } = deps.providers;
  const { longhornHelmChart, longhornResources } = deps.longhorn;
  const { postgresqlOperatorHelmChart } = deps.dataOperators;
  const { istioGateway } = deps.mesh;

  const authentikHelmChart =
    new components.authentik.AuthentikHelmChartComponent(
      'authentikHelmChart',
      {
        namespace: authentikNames.namespace,
        helm: {
          authentik: {
            version: utils.configs.helmChartVersions.authentik,
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
        dependsOn: [
          longhornHelmChart,
          longhornResources,
          postgresqlOperatorHelmChart,
        ],
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
        providers: {
          authentik: authentikProvider,
        },
      },
      {
        dependsOn: [authentikServiceMesh, authentikHelmChart],
      },
    );

  return {
    authentikHelmChart,
    authentikServiceMesh,
    authentikProvider,
    authentikResources,
  };
};

export type AuthentikPhase = ReturnType<typeof deployAuthentik>;

/**
 * Proxy Outpost — Longhorn ProviderProxy를 bootstrap provider로 생성.
 * 이후 proxy 앱은 OutpostProviderAttachment로 붙고, 그 drift는 컴포넌트 ignoreChanges로 무시한다.
 */
export const deployAuthentikOutpost = (deps: {
  authentik: AuthentikPhase;
  longhornServiceMesh: LonghornServiceMeshPhase;
}) => {
  const { authentikResources, authentikProvider } = deps.authentik;
  const { longhornServiceMesh } = deps.longhornServiceMesh;

  const authentikOutpost = new components.authentik.AuthentikOutpostComponent(
    'authentikOutpost',
    {
      outposts: {
        proxy: {
          name: authentikNames.proxyOutpostName,
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

  return { authentikOutpost };
};

export type AuthentikOutpostPhase = ReturnType<typeof deployAuthentikOutpost>;
