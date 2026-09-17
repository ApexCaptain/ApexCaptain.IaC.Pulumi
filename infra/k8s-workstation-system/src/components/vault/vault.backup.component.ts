/**
 * Vault 백업 허브
 *
 * - dr → VaultRaftArchiveV1 (raft snapshot → Crypt)
 * - K8s auth role + `sys/storage/raft/snapshot` policy (bootstrap token 금지)
 *
 * clusterName · credentials는 system pcloud-backup platform SSOT.
 *
 * @see docs/issues/2026-09-15-pcloud-pvc-encrypted-backup.md
 */
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as k8s from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
import dedent from 'dedent';

interface VaultBackupComponentArgsShape {
  /** Vault 서버 Namespace */
  namespace: string;
  /**
   * pCloud path leaf. 예: `data-vault-0`
   */
  leafName: string;
  schedule: {
    cron: string;
    timezone: string;
  };
  /** 예: `2d` */
  keepWithin: string;
  platform: {
    namespace: string;
    configMapName: string;
    credentialsSecretName: string;
    drLeaseName: string;
  };
  vault: {
    address: string;
    caSecretName: string;
    caSecretKey?: string;
    kubernetesAuthMountPath: string;
  };
  /**
   * true면 배포 직후 one-shot Job (기본 false).
   * @see VaultRaftArchiveV1 `runOnceOnCreate`
   */
  runOnceOnCreate?: boolean;
  providers: {
    kubernetes: k8s.Provider;
    vault: vault.Provider;
  };
}

export type VaultBackupComponentArgs =
  utils.types.DeepPulumiInput<VaultBackupComponentArgsShape>;

export const VaultBackupComponent = utils.functions.defineComponent(
  'vault-backup',
  (
    args: VaultBackupComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namePrefix = 'vault-backup-raft';
    const roleName = 'vault-backup-raft';
    const policyName = 'vault-backup-raft';

    const vaultOpts = {
      ...opts,
      provider: args.providers.vault,
    };

    // GET snapshot = read+sudo. POST restore = create|update+sudo.
    // https://developer.hashicorp.com/vault/api-docs/system/storage/raft/snapshot
    const raftSnapshotPolicy = new vault.Policy(
      `${resourceName}-raftSnapshotPolicy`,
      {
        name: policyName,
        policy: dedent`
          path "sys/storage/raft/snapshot" {
            capabilities = ["read", "create", "update", "sudo"]
          }
        `,
      },
      vaultOpts,
    );

    const k8sAuthRole = new vault.kubernetes.AuthBackendRole(
      `${resourceName}-k8sAuthRole`,
      {
        backend: args.vault.kubernetesAuthMountPath,
        roleName,
        boundServiceAccountNames: [namePrefix],
        boundServiceAccountNamespaces: [args.namespace],
        tokenPolicies: [raftSnapshotPolicy.name],
        tokenTtl: 600,
      },
      {
        ...vaultOpts,
        dependsOn: [raftSnapshotPolicy],
      },
    );

    const archive =
      new customResources.components.backup.VaultRaftArchiveV1Component(
        `${resourceName}-dr`,
        {
          namePrefix,
          namespace: args.namespace,
          leafName: args.leafName,
          schedule: args.schedule,
          keepWithin: args.keepWithin,
          platform: args.platform,
          vault: {
            address: args.vault.address,
            caSecretName: args.vault.caSecretName,
            caSecretKey: args.vault.caSecretKey,
            kubernetesAuthMountPath: args.vault.kubernetesAuthMountPath,
            kubernetesAuthRoleName: roleName,
          },
          runOnceOnCreate: args.runOnceOnCreate === true,
          providers: {
            kubernetes: args.providers.kubernetes,
          },
        },
        {
          ...opts,
          dependsOn: [k8sAuthRole],
        },
      );

    return {
      output: pulumi.output({
        dr: archive.output,
        policyName: raftSnapshotPolicy.name,
        kubernetesAuthRoleName: k8sAuthRole.roleName,
      }),
      secret: pulumi.secret({}),
    };
  },
);
