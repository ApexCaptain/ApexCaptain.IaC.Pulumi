/**
 * Jellyfin 백업 — Lane A dr
 *
 * `jellyfin-config` PVC → PvcSnapshotArchiveV1 (VolumeSnapshot → tar.zst → Crypt).
 * platform credentials·clusterName SSOT는 system `pcloud-backup`.
 *
 * @see docs/issues/active/2026-09-15-pcloud-pvc-encrypted-backup.md
 */
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as k8s from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

type DrTarget =
  customResources.components.backup.PvcSnapshotArchiveTargetShape;

interface JellyfinBackupComponentArgsShape {
  namespace: string;
  dr: {
    targets: DrTarget[];
  };
  platform: {
    namespace: string;
    configMapName: string;
    credentialsSecretName: string;
    slackSecretName: string;
    drLeaseName: string;
    volumeSnapshotClassName: string;
  };
  runOnceOnCreate?: boolean;
  providers: {
    kubernetes: k8s.Provider;
  };
}

export type JellyfinBackupComponentArgs =
  utils.types.DeepPulumiInput<JellyfinBackupComponentArgsShape>;

export const JellyfinBackupComponent = utils.functions.defineComponent(
  'jellyfin-backup',
  (
    args: JellyfinBackupComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    if (pulumi.Output.isInstance(args.dr?.targets)) {
      throw new Error(
        'jellyfin-backup: dr.targets must be a concrete array (not Output)',
      );
    }

    const drArchive =
      new customResources.components.backup.PvcSnapshotArchiveV1Component(
        `${resourceName}-dr`,
        {
          namePrefix: 'jellyfin-backup-dr',
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
