import { coderd } from '@common/bridged-provider';
import * as nexus from '@common/nexus';
import * as utils from '@common/utils';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import { k8sWorkstationSystemContract } from '@infra/k8s-workstation-system/src/contract';
import * as pulumi from '@pulumi/pulumi';
import * as components from '../components';
import { ToolsProviders } from './providers';

/** Coder base → Authentik OIDC → Helm → mesh → coderd Provider → 템플릿 리소스. */
export const deployCoder = (deps: { providers: ToolsProviders }) => {
  const commonEsc = nexus.esc.commonEsc;
  const projectEsc = nexus.esc.k8sWorkstationToolsEsc;
  const { workstationK8sProvider, authentikProvider } = deps.providers;

  const coderHost =
    cloudflareContract.output.zones.ayteneve93com.records.coder;
  const vaultHost = k8sWorkstationSystemContract.output.vault.host;
  const authentikHost =
    cloudflareContract.output.zones.ayteneve93com.records.auth;

  const coderBase = new components.coder.CoderBaseComponent('coderBase', {
    pvc: {
      postgresqlCluster: {
        storageClass:
          k8sWorkstationSystemContract.output.storageClasses.longhornSsd,
        size: '10Gi',
      },
    },
    providers: {
      kubernetes: workstationK8sProvider,
    },
  });
  const coderAuthentik = new components.coder.CoderAuthentikComponent(
    'coderAuthentik',
    {
      hosts: {
        coder: coderHost,
        authentik: authentikHost,
      },
      authentik: {
        allowedGroupId:
          k8sWorkstationSystemContract.output.authentik.groupIds
            .toolsUserGroup,
        flow: {
          authorizationFlowId:
            k8sWorkstationSystemContract.output.authentik.flow
              .defaultProviderAuthorizationImplicitConsentId,
          invalidationFlowId:
            k8sWorkstationSystemContract.output.authentik.flow
              .defaultInvalidationFlowId,
        },
      },
      providers: {
        authentik: authentikProvider,
      },
    },
  );
  const coderHelmChart = new components.coder.CoderHelmChartComponent(
    'coderHelmChart',
    {
      namespace: coderBase.output.namespace,
      host: coderHost,
      adminUser: {
        email: projectEsc.esc.coder.firstUser.email,
        username: projectEsc.esc.coder.firstUser.username,
        fullName: projectEsc.esc.coder.firstUser.fullName,
        password: projectEsc.esc.coder.firstUser.password,
      },
      oidc: {
        issuerUrl: coderAuthentik.output.oidc.issuerUrl,
        clientId: coderAuthentik.secret.oidc.clientId,
        clientSecret: coderAuthentik.secret.oidc.clientSecret,
      },
      externalAuth: {
        github: {
          clientId: projectEsc.esc.coder.githubApp.clientId,
          clientSecret: projectEsc.esc.coder.githubApp.clientSecret,
        },
      },
      postgresql: {
        urlSecret: {
          name: coderBase.secret.postgresqlUrlSecretName,
          key: coderBase.secret.postgresqlUrlSecretKey,
        },
      },
      helm: {
        coder: {
          version: utils.configs.helmChartVersions.coder,
          repositoryUrl:
            commonEsc.esc.helmRepositoryUrls['helm.coder.com/v2'],
        },
      },
      workspaceNamespaces: [
        coderBase.output.kataUbuntuNamespace,
        coderBase.output.kataUbuntuTestNamespace,
      ],
      adminApiToken: {
        kubeconfig: commonEsc.esc.workstationKubeconfig,
      },
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
    {
      dependsOn: [coderBase, coderAuthentik],
    },
  );

  const coderServiceMesh = new components.coder.CoderServiceMeshComponent(
    'coderServiceMesh',
    {
      namespace: coderBase.output.namespace,
      authorizationPolicy: {
        from: {
          istioIngress: {
            namespace: k8sWorkstationSystemContract.output.namespaces.istio,
            serviceAccountName:
              k8sWorkstationSystemContract.output.serviceAccounts
                .istioIngressGateway,
          },
          allowedNamespaces: [
            coderBase.output.kataUbuntuNamespace,
            coderBase.output.kataUbuntuTestNamespace,
          ],
        },
      },
      adminApiToken: {
        token: coderHelmChart.secret.adminApiToken.token,
        organizationId: coderHelmChart.secret.adminApiToken.organizationId,
      },
      ingress: {
        coderWebUi: {
          host: coderHost,
          serviceName: coderHelmChart.output.services.coder.name,
          gatewayPath:
            k8sWorkstationSystemContract.output.gatewayPaths
              .ingressGatewayPath,
          port: coderHelmChart.output.services.coder.port.http,
        },
      },
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
    {
      dependsOn: [coderHelmChart],
    },
  );

  const coderdProvider = new coderd.Provider(
    'coderdProvider',
    {
      url: coderServiceMesh.secret.coderdProviderConfig.url,
      token: coderServiceMesh.secret.coderdProviderConfig.token,
      defaultOrganizationId:
        coderServiceMesh.secret.coderdProviderConfig.defaultOrganizationId,
    },
    {
      dependsOn: [coderServiceMesh],
    },
  );

  const coderResources = new components.coder.CoderResourcesComponent(
    'coderResources',
    {
      templateVariables: {
        kataUbuntu: {
          namespace: coderBase.output.kataUbuntuNamespace,
          runtimeClassName:
            k8sWorkstationSystemContract.output.kata.runtimeClassName,
          storageClassNames: {
            home: k8sWorkstationSystemContract.output.storageClasses
              .longhornSsd,
            docker:
              k8sWorkstationSystemContract.output.storageClasses
                .longhornSsd,
            data: k8sWorkstationSystemContract.output.storageClasses
              .longhornHdd,
          },
          istioProxyImage: utils.configs.containerImages.istioProxyv2,
          vault: {
            addr: pulumi.interpolate`https://${vaultHost}`,
            jwtAuthPath:
              k8sWorkstationSystemContract.output.vault.coderJwt.mountPath,
            jwtRole:
              k8sWorkstationSystemContract.output.vault.coderJwt.roleName,
          },
        },
        kataUbuntuTest: {
          namespace: coderBase.output.kataUbuntuTestNamespace,
          runtimeClassName:
            k8sWorkstationSystemContract.output.kata.runtimeClassName,
          storageClassNames: {
            home: k8sWorkstationSystemContract.output.storageClasses
              .longhornSsd,
            docker:
              k8sWorkstationSystemContract.output.storageClasses
                .longhornSsd,
            data: k8sWorkstationSystemContract.output.storageClasses
              .longhornHdd,
          },
          istioProxyImage: utils.configs.containerImages.istioProxyv2,
          vault: {
            addr: pulumi.interpolate`https://${vaultHost}`,
            jwtAuthPath:
              k8sWorkstationSystemContract.output.vault.coderJwt.mountPath,
            jwtRole:
              k8sWorkstationSystemContract.output.vault.coderJwt.roleName,
          },
        },
      },
      providers: {
        coderd: coderdProvider,
      },
    },
    {
      dependsOn: [coderBase, coderdProvider],
    },
  );

  return {
    coderBase,
    coderAuthentik,
    coderHelmChart,
    coderServiceMesh,
    coderdProvider,
    coderResources,
  };
};
