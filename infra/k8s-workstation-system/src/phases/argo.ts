import { argocd } from '@common/bridged-provider';
import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import { githubContract } from '@infra/github/src/contract';
import * as components from '../components';
import { AuthentikPhase } from './authentik';
import { DataOperatorsPhase } from './data-operators';
import { LonghornPhase } from './longhorn';
import { MeshPhase } from './mesh';
import { SystemProviders } from './providers';

/**
 * Argo Rollouts·CD. GitOps 레포 정체성은 `githubContract`, 이 phase는 deploy key·webhook만 붙인다.
 * CD는 Authentik OIDC·Redis Operator 이후, AppProject·repo 등록은 argocd Provider 이후.
 */
export const deployArgo = (deps: {
  providers: SystemProviders;
  mesh: MeshPhase;
  longhorn: LonghornPhase;
  dataOperators: DataOperatorsPhase;
  authentik: AuthentikPhase;
}) => {
  const commonEsc = nexus.esc.commonEsc;
  const projectEsc = nexus.esc.k8sWorkstationSystemEsc;
  const { workstationK8sProvider, apexCaptainGithubProvider } = deps.providers;
  const { istioGateway } = deps.mesh;
  const { longhornResources } = deps.longhorn;
  const { redisOperatorHelmChart } = deps.dataOperators;
  const { authentikResources, authentikProvider } = deps.authentik;

  // Argo (CD / Rollouts / Workflows …)
  const argoChartRepositoryUrl =
    commonEsc.esc.helmRepositoryUrls['argoproj.github.io/argo-helm'];

  // Argo Rollouts — CD와 독립. Application이 Rollout CR을 쓰기 전에 컨트롤러 준비.
  new components.argo.ArgoRolloutsComponent('argoRollouts', {
    helm: {
      argoRollouts: {
        version: utils.configs.helmChartVersions.argoRollouts,
        repositoryUrl: argoChartRepositoryUrl,
      },
    },
    providers: {
      kubernetes: workstationK8sProvider,
    },
  });

  // Argo CD
  const argoGitOps = new components.argo.ArgoGitOpsComponent('argoGitOps', {
    gitOpsRepository: {
      name: githubContract.output.repositories.apexCaptainIacGitOps.name,
      sshCloneUrl:
        githubContract.output.repositories.apexCaptainIacGitOps.sshCloneUrl,
    },
    argoCdHost: cloudflareContract.output.zones.ayteneve93com.records.argoCd,
    providers: {
      github: apexCaptainGithubProvider,
    },
  });

  const argoAuthentik = new components.argo.ArgoAuthentikComponent(
    'argoAuthentik',
    {
      hosts: {
        argoCd: cloudflareContract.output.zones.ayteneve93com.records.argoCd,
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
        authentik: authentikProvider,
      },
    },
    {
      dependsOn: [authentikResources, authentikProvider],
    },
  );

  const argoCd = new components.argo.ArgoCdComponent(
    'argoCd',
    {
      host: cloudflareContract.output.zones.ayteneve93com.records.argoCd,
      bootstrapPasswordBcrypt: projectEsc.esc.argoCd.bootstrapPasswordBcrypt,
      githubSecret: argoGitOps.secret.webHookSecret,
      oidc: {
        name: argoAuthentik.output.oidc.name,
        issuerUrl: argoAuthentik.output.oidc.issuerUrl,
        groupsClaim: argoAuthentik.output.oidc.groupsClaim,
        requestedScopes: argoAuthentik.output.oidc.requestedScopes,
        clientId: argoAuthentik.secret.oidc.clientId,
        clientSecret: argoAuthentik.secret.oidc.clientSecret,
      },
      helm: {
        argoCd: {
          version: utils.configs.helmChartVersions.argoCd,
          repositoryUrl: argoChartRepositoryUrl,
        },
      },
      redis: {
        password: projectEsc.esc.argoCd.redisPassword,
        storageClass: longhornResources.output.storageClasses.longhornSsd,
      },
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
    {
      dependsOn: [argoAuthentik, redisOperatorHelmChart],
    },
  );

  const argoServiceMesh = new components.argo.ArgoServiceMeshComponent(
    'argoServiceMesh',
    {
      namespace: argoCd.output.namespace,
      bootstrapPassword: projectEsc.esc.argoCd.bootstrapPassword,
      ingress: {
        argoCd: {
          host: cloudflareContract.output.zones.ayteneve93com.records.argoCd,
          serviceName: argoCd.output.services.argoCdServer.name,
          gatewayPath: istioGateway.output.istioIngressGatewayPath,
          port: argoCd.output.services.argoCdServer.port.webUi,
        },
      },
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
  );

  const argoCdProvider = new argocd.Provider(
    'argoCdProvider',
    argoServiceMesh.secret.argoCdProviderConfig,
    {
      dependsOn: [argoCd, argoServiceMesh],
    },
  );

  const argoResources = new components.argo.ArgoResourcesComponent(
    'argoResources',
    {
      namespace: argoCd.output.namespace,
      gitOpsRepository: {
        name: argoGitOps.output.gitOpsRepository.name,
        sshCloneUrl: argoGitOps.output.gitOpsRepository.sshCloneUrl,
        deployPrivateKeyPem: argoGitOps.secret.deployPrivateKeyPem,
      },
      gitOpsProjects: {
        apps: {
          name: argoCd.output.projects.apps.name,
          accountName: argoCd.output.projects.apps.accountName,
          readerGroupName: argoCd.output.projects.apps.readerGroupName,
        },
        tools: {
          name: argoCd.output.projects.tools.name,
          accountName: argoCd.output.projects.tools.accountName,
          readerGroupName: argoCd.output.projects.tools.readerGroupName,
        },
      },
      providers: {
        argocd: argoCdProvider,
        authentik: authentikProvider,
      },
    },
    {
      dependsOn: [
        argoCd,
        argoServiceMesh,
        argoCdProvider,
        argoAuthentik,
        authentikProvider,
      ],
    },
  );

  return { argoCd, argoResources };
};
