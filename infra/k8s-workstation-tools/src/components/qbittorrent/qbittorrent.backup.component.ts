/**
 * qBittorrent 백업 허브
 *
 * - dr    → PvcSnapshotArchiveV1
 * - media → 후속 sync 컴포넌트 (여기 자식으로 추가)
 *
 * clusterName · credentials는 system pcloud-backup platform SSOT.
 * Job이 ConfigMap/Secret get. worker에는 base64 env로만 전달.
 *
 * @see docs/issues/2026-09-15-pcloud-pvc-encrypted-backup.md
 */
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as k8s from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

type DrTarget =
  customResources.components.backup.PvcSnapshotArchiveTargetShape;

interface QbittorrentBackupComponentArgsShape {
  namespace: string;
  dr: {
    /** id 예: `config`. pvcName은 app output 권장 */
    targets: DrTarget[];
  };
  platform: {
    namespace: string;
    configMapName: string;
    credentialsSecretName: string;
    drLeaseName: string;
    volumeSnapshotClassName: string;
  };
  /**
   * true면 dr target마다 배포 직후 one-shot Job (기본 false).
   * @see PvcSnapshotArchiveV1 `runOnceOnCreate`
   */
  runOnceOnCreate?: boolean;
  providers: {
    kubernetes: k8s.Provider;
  };
}

export type QbittorrentBackupComponentArgs =
  utils.types.DeepPulumiInput<QbittorrentBackupComponentArgsShape>;

export const QbittorrentBackupComponent = utils.functions.defineComponent(
  'qbittorrent-backup',
  (
    args: QbittorrentBackupComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    if (pulumi.Output.isInstance(args.dr?.targets)) {
      throw new Error(
        'qbittorrent-backup: dr.targets must be a concrete array (not Output)',
      );
    }

    const drArchive =
      new customResources.components.backup.PvcSnapshotArchiveV1Component(
        `${resourceName}-dr`,
        {
          namePrefix: 'qbittorrent-backup-dr',
          namespace: args.namespace,
          targets: args.dr.targets,
          platform: args.platform,
          runOnceOnCreate: args.runOnceOnCreate === true,
          providers: args.providers,
        },
        opts,
      );

    return {
      output: pulumi.output({
        dr: drArchive.output,
      }),
      secret: pulumi.secret({}),
    };
  },
);
