/**
 * pCloud 백업 플랫폼 — Namespace · Credentials Secret · 큐 Lease · VolumeSnapshotClass
 *
 * 큐 이름 = pCloud 경로 prefix와 동일:
 * - `dr`    — raft/pg_dump/소형 tar (k8s-backup/dr/...)
 * - `media` — 대용량 rclone sync (k8s-backup/media/..., coder-ws home)
 *
 * VolumeSnapshotClass는 snapshot-controller CRD 이후에 생성 (caller dependsOn).
 * 백업 CronJob 자체는 워크로드 소유 스택에 둔다.
 * 이름·Secret 키는 export const 없이 literal + output으로만 노출.
 *
 * @see docs/issues/2026-09-15-pcloud-pvc-encrypted-backup.md
 */
import * as utils from '@common/utils/src';
import * as k8s from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface PcloudBackupPlatformComponentArgsShape {
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
        namespace: namespace.metadata.name,
        credentialsSecretName: credentialsSecret.metadata.name,
        credentialsSecretKeys: {
          hostname: 'hostname',
          token: 'token',
          cryptPassword: 'crypt-password',
          cryptPassword2: 'crypt-password2',
        },
        drLeaseName: drLease.metadata.name,
        mediaLeaseName: mediaLease.metadata.name,
        volumeSnapshotClassName: volumeSnapshotClass.metadata.name,
      }),
      secret: pulumi.secret({}),
    };
  },
);
