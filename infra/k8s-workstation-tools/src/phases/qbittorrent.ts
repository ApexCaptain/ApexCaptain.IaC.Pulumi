import * as nexus from '@common/nexus';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import { k8sWorkstationSystemContract } from '@infra/k8s-workstation-system/src/contract';
import CronTime from 'cron-time-generator';
import Timezone from 'timezone-enum';
import * as components from '../components';
import { ToolsProviders } from './providers';

/** qBittorrent app → Authentik proxy mesh → config DR backup. */
export const deployQbittorrent = (deps: { providers: ToolsProviders }) => {
  const commonEsc = nexus.esc.commonEsc;
  const projectEsc = nexus.esc.k8sWorkstationToolsEsc;
  const { workstationK8sProvider, authentikProvider, vaultProvider } =
    deps.providers;

  const qbittorrentApp = new components.qbittorrent.QbittorrentAppComponent(
    'qbittorrentApp',
    {
      nordLynx: {
        allowedCidrBlocks: [
          commonEsc.esc.workstationPodsSubnetCidrBlock,
          commonEsc.esc.workstationServicesSubnetCidrBlock,
        ],
        privateKey: commonEsc.esc.nordLynx.privateKey,
      },
      sftpUserName: commonEsc.esc.adapter.sftp.userName,
      sftp: {
        issuerGroupName: 'System Manager',
        issuerIdentityGroupId:
          k8sWorkstationSystemContract.output.vault.identityGroupIds.apply(
            ids => ids['System Manager'],
          ),
        hostPrincipals: [
          commonEsc.esc.workstationIptimeDomain,
          commonEsc.esc.workstationIpV4Address,
        ],
        userCaMount:
          k8sWorkstationSystemContract.secret.vault.ssh.userCaMount,
        hostCaMount:
          k8sWorkstationSystemContract.secret.vault.ssh.hostCaMount,
        kvMount: k8sWorkstationSystemContract.secret.vault.kvMount,
        slackWebhookUrl: projectEsc.esc.slackWebhookUrlVaultInfraWarning,
        vaultConnectionRef:
          k8sWorkstationSystemContract.output.vaultSecretsOperator
            .vaultConnectionRef,
        kubernetesAuthMountPath:
          k8sWorkstationSystemContract.secret.vault.kubernetesAuthMountPath,
        vault: {
          address:
            k8sWorkstationSystemContract.secret.vault.cluster.address,
          tlsServerName:
            k8sWorkstationSystemContract.secret.vault.cluster.tlsServerName,
          ca: {
            namespace:
              k8sWorkstationSystemContract.secret.vault.cluster.namespace,
            secretName:
              k8sWorkstationSystemContract.secret.vault.cluster
                .rootCaSecretName,
          },
        },
      },
      directGateway: {
        gatewayPath:
          k8sWorkstationSystemContract.output.gatewayPaths
            .directGatewayPath,
        qbitorrentSftp: {
          port: commonEsc.esc.istioNetwork.workstationDirectGateway
            .qbittorrentSftpPort,
        },
      },

      pvc: {
        qbittorrentModCache: {
          storageClass:
            k8sWorkstationSystemContract.output.storageClasses.longhornSsd,
          size: '100Mi',
        },
        qbittorrentConfig: {
          storageClass:
            k8sWorkstationSystemContract.output.storageClasses.longhornSsd,
          size: '200Mi',
        },
        qbittorrentCompleteDownloads: {
          storageClass:
            k8sWorkstationSystemContract.output.storageClasses.longhornHdd,
          size: '1Ti',
        },
        qbittorrentIncompleteDownloads: {
          storageClass:
            k8sWorkstationSystemContract.output.storageClasses.longhornSsd,
          size: '300Gi',
        },
      },
      providers: {
        kubernetes: workstationK8sProvider,
        vault: vaultProvider,
      },
    },
  );

  const qbittorrentServiceMesh =
    new components.qbittorrent.QbittorrentServiceMeshComponent(
      'qbittorrentServiceMesh',
      {
        namespace: qbittorrentApp.output.namespace,
        ingress: {
          istioNamespace:
            k8sWorkstationSystemContract.output.namespaces.istio,
          qbittorrentWebUi: {
            host: cloudflareContract.output.zones.ayteneve93com.records
              .torrent,
            serviceName: qbittorrentApp.output.services.qbittorrent.name,
            gatewayPath:
              k8sWorkstationSystemContract.output.gatewayPaths
                .ingressGatewayPath,
            gatewayLabel:
              k8sWorkstationSystemContract.output.serviceMesh
                .istioIngressGatewayLabel,
            port: qbittorrentApp.output.services.qbittorrent.port.webUi,
          },
        },
        authentik: {
          allowedGroupId:
            k8sWorkstationSystemContract.output.authentik.groupIds
              .toolsManagerGroup,
          proxyOutpostId:
            k8sWorkstationSystemContract.output.authentik.outposts.proxy.id,
          proxyOutpostProviderName:
            k8sWorkstationSystemContract.output.authentik.outposts.proxy
              .providerName,
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
          kubernetes: workstationK8sProvider,
          authentik: authentikProvider,
        },
      },
    );

  const qbittorrentBackup =
    new components.qbittorrent.QbittorrentBackupComponent(
      'qbittorrentBackup',
      {
        namespace: qbittorrentApp.output.namespace,
        runOnceOnCreate: false,
        notifyOnSuccess: false,
        dr: {
          targets: [
            {
              id: 'config',
              pvcName: qbittorrentApp.output.pvcs.config.name,
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
        dependsOn: [qbittorrentApp],
      },
    );

  return { qbittorrentApp, qbittorrentServiceMesh, qbittorrentBackup };
};
