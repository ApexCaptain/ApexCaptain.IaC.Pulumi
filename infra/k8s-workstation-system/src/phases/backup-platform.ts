import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import * as components from '../components';
import { SystemProviders } from './providers';

/** CSI VolumeSnapshot + pCloud 백업 플랫폼(credentials·Lease·VSC). 개별 백업 Job은 각 소유 스택·phase가 만든다. */
export const deployBackupPlatform = (deps: { providers: SystemProviders }) => {
  const commonEsc = nexus.esc.commonEsc;
  const projectEsc = nexus.esc.k8sWorkstationSystemEsc;
  const { workstationK8sProvider } = deps.providers;

  // CSI VolumeSnapshot CRD·controller — PVC tar 백업·Platform VSC 선행
  const snapshotControllerHelmChart =
    new components.snapshotController.SnapshotControllerHelmChartComponent(
      'snapshotControllerHelmChart',
      {
        helm: {
          snapshotController: {
            version: utils.configs.helmChartVersions.snapshotController,
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls['piraeus.io/helm-charts'],
          },
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
    );

  // pCloud credentials·Lease·VSC. Lane A/B Job은 platform 이름만 참조 (Vault raft Job은 vault k8s auth 이후).
  const pcloudBackupPlatform =
    new components.pcloudBackup.PcloudBackupPlatformComponent(
      'pcloudBackupPlatform',
      {
        clusterName: commonEsc.esc.istioNetwork.workstationClusterName,
        credentials: {
          hostname: projectEsc.esc.pcloudBackup.hostname,
          token: projectEsc.esc.pcloudBackup.token,
          cryptPassword: projectEsc.esc.pcloudBackup.cryptPassword,
          cryptPassword2: projectEsc.esc.pcloudBackup.cryptPassword2,
        },
        slack: {
          webhookUrlBackupInfraInfo:
            projectEsc.esc.pcloudBackup.slackWebhookUrlBackupInfraInfo,
          webhookUrlBackupInfraError:
            projectEsc.esc.pcloudBackup.slackWebhookUrlBackupInfraError,
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      {
        // VolumeSnapshotClass는 snapshot.storage CRD 이후
        dependsOn: [snapshotControllerHelmChart],
      },
    );

  return { snapshotControllerHelmChart, pcloudBackupPlatform };
};

export type BackupPlatformPhase = ReturnType<typeof deployBackupPlatform>;
