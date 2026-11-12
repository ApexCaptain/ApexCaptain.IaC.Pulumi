import * as nexus from '@common/nexus';
import * as utils from '@common/utils';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import { k8sWorkstationSystemContract } from '@infra/k8s-workstation-system/src/contract';
import CronTime from 'cron-time-generator';
import Timezone from 'timezone-enum';
import * as components from '../components';
import { ToolsProviders } from './providers';

/** Vikunja base → Authentik OIDC → Helm → backup → mesh. */
export const deployVikunja = (deps: { providers: ToolsProviders }) => {
  const commonEsc = nexus.esc.commonEsc;
  const { workstationK8sProvider, authentikProvider } = deps.providers;

  const vikunjaHost =
    cloudflareContract.output.zones.ayteneve93com.records.todo;
  const authentikHost =
    cloudflareContract.output.zones.ayteneve93com.records.auth;

  const vikunjaBase = new components.vikunja.VikunjaBaseComponent(
    'vikunjaBase',
    {
      pvc: {
        postgresqlCluster: {
          storageClass:
            k8sWorkstationSystemContract.output.storageClasses.longhornSsd,
          size: '8Gi',
        },
      },
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
  );

  const vikunjaAuthentik = new components.vikunja.VikunjaAuthentikComponent(
    'vikunjaAuthentik',
    {
      hosts: {
        vikunja: vikunjaHost,
        authentik: authentikHost,
      },
      oidcProviderKey: 'authentik',
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

  const vikunjaHelmChart = new components.vikunja.VikunjaHelmChartComponent(
    'vikunjaHelmChart',
    {
      namespace: vikunjaBase.output.namespace,
      host: vikunjaHost,
      oidc: {
        providerKey: vikunjaAuthentik.output.oidc.providerKey,
        providerName: 'Login with Authentik',
        authUrl: vikunjaAuthentik.output.oidc.authUrl,
        scope: 'openid profile email',
        clientId: vikunjaAuthentik.secret.oidc.clientId,
        clientSecret: vikunjaAuthentik.secret.oidc.clientSecret,
      },
      postgresql: {
        database: vikunjaBase.secret.postgresqlDatabase,
        host: vikunjaBase.secret.postgresqlReadWriteFqdn,
        authSecret: {
          name: vikunjaBase.secret.postgresqlAuthSecretName,
          usernameKey: vikunjaBase.secret.postgresqlAuthSecretUsernameKey,
          passwordKey: vikunjaBase.secret.postgresqlAuthSecretPasswordKey,
        },
      },
      helm: {
        vikunja: {
          version: utils.configs.helmChartVersions.vikunja,
          repositoryUrl:
            commonEsc.esc.helmRepositoryUrls[
              'go-vikunja/helm-chart/vikunja'
            ],
        },
      },
      pvc: {
        vikunja: {
          data: {
            storageClass:
              k8sWorkstationSystemContract.output.storageClasses
                .longhornSsd,
            size: '2Gi',
          },
        },
      },
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
    {
      dependsOn: [vikunjaBase, vikunjaAuthentik],
    },
  );

  const vikunjaBackup = new components.vikunja.VikunjaBackupComponent(
    'vikunjaBackup',
    {
      namespace: vikunjaBase.output.namespace,
      runOnceOnCreate: false,
      notifyOnSuccess: false,
      dr: {
        targets: [
          {
            id: 'data',
            pvcName: vikunjaHelmChart.output.pvcs.data.name,
            schedule: {
              cron: CronTime.everyDayAt(12),
              timezone: Timezone['Asia/Seoul'],
            },
            keepWithin: '10d',
          },
        ],
      },
      platform: {
        namespace:
          k8sWorkstationSystemContract.output.pcloudBackup.namespace,
        configMapName:
          k8sWorkstationSystemContract.output.pcloudBackup.configMapName,
        credentialsSecretName:
          k8sWorkstationSystemContract.output.pcloudBackup
            .credentialsSecretName,
        slackSecretName:
          k8sWorkstationSystemContract.output.pcloudBackup.slackSecretName,
        drLeaseName:
          k8sWorkstationSystemContract.output.pcloudBackup.drLeaseName,
        volumeSnapshotClassName:
          k8sWorkstationSystemContract.output.pcloudBackup
            .volumeSnapshotClassName,
      },
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
    {
      dependsOn: [vikunjaHelmChart],
    },
  );

  const vikunjaServiceMesh =
    new components.vikunja.VikunjaServiceMeshComponent(
      'vikunjaServiceMesh',
      {
        namespace: vikunjaBase.output.namespace,
        authorizationPolicy: {
          from: {
            istioIngress: {
              namespace:
                k8sWorkstationSystemContract.output.namespaces.istio,
              serviceAccountName:
                k8sWorkstationSystemContract.output.serviceAccounts
                  .istioIngressGateway,
            },
          },
        },
        ingress: {
          vikunjaWebUi: {
            host: cloudflareContract.output.zones.ayteneve93com.records
              .todo,
            serviceName: vikunjaHelmChart.output.services.vikunja.name,
            gatewayPath:
              k8sWorkstationSystemContract.output.gatewayPaths
                .ingressGatewayPath,
            port: vikunjaHelmChart.output.services.vikunja.port.webUi,
          },
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      {
        dependsOn: [vikunjaHelmChart],
      },
    );

  return {
    vikunjaBase,
    vikunjaAuthentik,
    vikunjaHelmChart,
    vikunjaBackup,
    vikunjaServiceMesh,
  };
};
