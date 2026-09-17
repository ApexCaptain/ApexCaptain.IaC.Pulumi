/**
 * pCloud 백업 플랫폼 — NS · Credentials Secret · ConfigMap(clusterName) · Lease · VolumeSnapshotClass
 *
 * pCloud 경로: k8s-backup/{clusterName}/{lane}/...
 * 큐(lane):
 * - `dr`    — raft/pg_dump/소형 tar
 * - `media` — 대용량 rclone sync
 *
 * clusterName·credentials SSOT는 여기. 워크로드 CronJob은 이름만 받아 Job이 런타임 조회.
 *
 * @see docs/issues/2026-09-15-pcloud-pvc-encrypted-backup.md
 */
import * as utils from '@common/utils/src';
import * as k8s from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface PcloudBackupPlatformComponentArgsShape {
  /** pCloud 경로 클러스터 구분자 — k8s-backup/{clusterName}/... */
  clusterName: string;
  credentials: {
    hostname: string;
    token: string;
    cryptPassword: string;
    cryptPassword2: string;
  };
  providers: {
    kubernetes: k8s.Provider;
  };
}

export type PcloudBackupPlatformComponentArgs =
  utils.types.DeepPulumiInput<PcloudBackupPlatformComponentArgsShape>;

export const PcloudBackupPlatformComponent = utils.functions.defineComponent(
  'pcloudBackupPlatform',
  (
    args: PcloudBackupPlatformComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new k8s.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'pcloud-backup',
          labels: {
            'app.kubernetes.io/name': 'pcloud-backup',
            'app.kubernetes.io/part-of': 'pcloud-backup',
            'goldilocks.fairwinds.com/enabled': 'true',
            'istio.io/dataplane-mode': 'none',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const credentialsSecret = new k8s.core.v1.Secret(
      `${resourceName}-credentials`,
      {
        metadata: {
          name: 'pcloud-backup-credentials',
          namespace: namespace.metadata.name,
          labels: {
            'app.kubernetes.io/name': 'pcloud-backup',
            'app.kubernetes.io/component': 'credentials',
          },
        },
        stringData: {
          'hostname': args.credentials.hostname,
          'token': args.credentials.token,
          'crypt-password': args.credentials.cryptPassword,
          'crypt-password2': args.credentials.cryptPassword2,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [namespace],
      },
    );

    // 워크로드 Job이 경로 세그먼트를 여기서 읽음 (스택마다 clusterName 전달 불필요)
    const configMap = new k8s.core.v1.ConfigMap(
      `${resourceName}-config`,
      {
        metadata: {
          name: 'pcloud-backup-config',
          namespace: namespace.metadata.name,
          labels: {
            'app.kubernetes.io/name': 'pcloud-backup',
            'app.kubernetes.io/component': 'config',
          },
        },
        data: {
          clusterName: args.clusterName,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [namespace],
      },
    );

    const drLease = new k8s.coordination.v1.Lease(
      `${resourceName}-drLease`,
      {
        metadata: {
          name: 'pcloud-backup-dr',
          namespace: namespace.metadata.name,
          labels: {
            'app.kubernetes.io/name': 'pcloud-backup',
            'backup.apexcaptain.com/queue': 'dr',
          },
        },
        spec: {
          // Holder identity filled by Jobs at runtime
          leaseDurationSeconds: 600,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [namespace],
      },
    );

    const mediaLease = new k8s.coordination.v1.Lease(
      `${resourceName}-mediaLease`,
      {
        metadata: {
          name: 'pcloud-backup-media',
          namespace: namespace.metadata.name,
          labels: {
            'app.kubernetes.io/name': 'pcloud-backup',
            'backup.apexcaptain.com/queue': 'media',
          },
        },
        spec: {
          leaseDurationSeconds: 7200,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [namespace],
      },
    );

    // Longhorn CSI CoW 스냅샷 (type=snap). bak=Longhorn backup target — 여기 안 씀.
    const volumeSnapshotClass = new k8s.apiextensions.CustomResource(
      `${resourceName}-volumeSnapshotClass`,
      {
        apiVersion: 'snapshot.storage.k8s.io/v1',
        kind: 'VolumeSnapshotClass',
        metadata: {
          name: 'longhorn-snap',
          labels: {
            'app.kubernetes.io/name': 'pcloud-backup',
            'app.kubernetes.io/component': 'volume-snapshot-class',
          },
          annotations: {
            'snapshot.storage.kubernetes.io/is-default-class': 'true',
          },
        },
        driver: 'driver.longhorn.io',
        deletionPolicy: 'Delete',
        parameters: {
          type: 'snap',
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    return {
      output: pulumi.output({
        clusterName: args.clusterName,
        configMapName: configMap.metadata.name,
        namespace: namespace.metadata.name,
        credentialsSecretName: credentialsSecret.metadata.name,
        drLeaseName: drLease.metadata.name,
        mediaLeaseName: mediaLease.metadata.name,
        volumeSnapshotClassName: volumeSnapshotClass.metadata.name,
      }),
      secret: pulumi.secret({}),
    };
  },
);
