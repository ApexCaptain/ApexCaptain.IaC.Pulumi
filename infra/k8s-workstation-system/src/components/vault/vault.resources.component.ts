/**
 * Vault 클러스터 공통 secrets engine·기반 설정.
 *
 * Helm bootstrap(root token) 이후, 앱별 policy·secret·OIDC identity group보다
 * 먼저 깔리는 mount·engine tune 등을 한곳에서 관리한다.
 *
 * ```
 * vaultHelmChart (bootstrap token)
 *        ↓
 * vaultServiceMesh (ingress provider)
 *        ↓
 * vaultResources — KV v2 mount `secret` + SSH CA mounts
 *        ↓
 * vaultAuthentik / apps·tools — policy·identity·SecretV2
 * ```
 */
import { kvV2UiBrowsePolicy } from '@common/custom-resources/src/components/vault/kv-v2-ui-browse.policy';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';

interface VaultResourcesComponentArgsShape {
  providers: {
    vault: vault.Provider;
  };
}

export type VaultResourcesComponentArgs =
  utils.types.DeepPulumiInput<VaultResourcesComponentArgsShape>;

export const VaultResourcesComponent = utils.functions.defineComponent(
  'vaultResources',
  (
    args: VaultResourcesComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const vaultProviderOpts = { ...opts, provider: args.providers.vault };

    const kvMount = new vault.Mount(
      `${resourceName}-kvMount`,
      {
        path: 'secret',
        type: 'kv',
        description:
          'Workstation apps — KV v2 (dev secrets under workstation-apps/…)',
        options: {
          version: '2',
        },
      },
      vaultProviderOpts,
    );

    new vault.kv.SecretBackendV2(
      `${resourceName}-kvMountConfig`,
      {
        mount: kvMount.path,
        maxVersions: 10,
      },
      {
        ...vaultProviderOpts,
        dependsOn: [kvMount],
      },
    );

    const userCaMount = new vault.Mount(
      `${resourceName}-sshUserCaMount`,
      {
        path: 'ssh-user-ca',
        type: 'ssh',
        description: 'Workstation SFTP user SSH CA',
      },
      vaultProviderOpts,
    );

    new vault.ssh.SecretBackendCa(
      `${resourceName}-sshUserCa`,
      {
        backend: userCaMount.path,
        generateSigningKey: true,
        keyType: 'ed25519',
      },
      {
        ...vaultProviderOpts,
        dependsOn: [userCaMount],
      },
    );

    const hostCaMount = new vault.Mount(
      `${resourceName}-sshHostCaMount`,
      {
        path: 'ssh-host-ca',
        type: 'ssh',
        description: 'Workstation SFTP host SSH CA',
      },
      vaultProviderOpts,
    );

    new vault.ssh.SecretBackendCa(
      `${resourceName}-sshHostCa`,
      {
        backend: hostCaMount.path,
        generateSigningKey: true,
        keyType: 'ed25519',
      },
      {
        ...vaultProviderOpts,
        dependsOn: [hostCaMount],
      },
    );

    const oidcKvPolicy = new vault.Policy(
      `${resourceName}-oidcKvPolicy`,
      {
        name: 'vault-oidc-kv',
        // SecretV1 prefix list. qBit + Jellyfin SftpV3 userKvPath
        policy: kvMount.path.apply(mount =>
          [
            kvV2UiBrowsePolicy({
              kvMount: mount,
              pathSegments: ['sftp', 'qbittorrent', 'sftp-adapter', 'user'],
              readSecretPaths: ['sftp/qbittorrent/sftp-adapter/user'],
            }),
            kvV2UiBrowsePolicy({
              kvMount: mount,
              pathSegments: [
                'sftp',
                'jellyfin',
                'jellyfin-sftp-adapter',
                'user',
              ],
              readSecretPaths: ['sftp/jellyfin/jellyfin-sftp-adapter/user'],
            }),
          ].join('\n'),
        ),
      },
      {
        ...vaultProviderOpts,
        dependsOn: [kvMount],
      },
    );

    return {
      output: pulumi.output({
        kv: {
          mountPath: kvMount.path,
          accessor: kvMount.accessor,
        },
        ssh: {
          userCaMount: userCaMount.path,
          hostCaMount: hostCaMount.path,
        },
        oidcKvPolicyName: oidcKvPolicy.name,
      }),
      secret: pulumi.secret({}),
    };
  },
);
