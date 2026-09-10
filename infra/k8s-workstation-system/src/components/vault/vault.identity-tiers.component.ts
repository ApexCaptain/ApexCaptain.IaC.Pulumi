/**
 * Vault OIDC 로그인 가능한 Authentik 티어와 1:1인 Vault external identity group.
 *
 * Vault 앱 bind는 System User(+ 자식 System Manager)만.
 * Application/Tools 티어는 Vault에 못 들어오므로 identity group을 만들지 않는다.
 *
 * GroupAlias 이름은 OIDC/JWT `groups` 클레임과 같아야 하고, 마운트당 하나다.
 * SftpV3와 vault-oidc-kv는 System Manager identity group에만 붙인다
 * (GroupPolicies exclusive=false).
 */
import { SFTP_ISSUER_GROUP_NAMES } from '@common/custom-resources/src/components/adapter/sftp.v3.component';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';

export const VAULT_LOGIN_TIER_GROUP_NAMES = SFTP_ISSUER_GROUP_NAMES;

export type VaultLoginTierGroupName =
  (typeof VAULT_LOGIN_TIER_GROUP_NAMES)[number];

interface VaultIdentityTiersComponentArgsShape {
  oidcMountAccessor: string;
  coderJwtMountAccessor: string;
  oidcKvPolicyName: string;
  providers: {
    vault: vault.Provider;
  };
}

export type VaultIdentityTiersComponentArgs =
  utils.types.DeepPulumiInput<VaultIdentityTiersComponentArgsShape>;

export const VaultIdentityTiersComponent = utils.functions.defineComponent(
  'vaultIdentityTiers',
  (
    args: VaultIdentityTiersComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const vaultProviderOpts = { ...opts, provider: args.providers.vault };

    const identityGroupIds: Record<string, pulumi.Output<string>> = {};
    // Vault identity group-alias Create 직후 Read가 빈 응답이면
    // Pulumi가 `expected non-nil error with nil state`로 죽는다.
    // 마운트당 병렬 create가 그 레이스를 키우므로 alias는 한 줄로 만든다.
    let previousAlias: vault.identity.GroupAlias | undefined;

    for (const groupName of VAULT_LOGIN_TIER_GROUP_NAMES) {
      const slug = groupName.toLowerCase().replace(/ /g, '-');
      const identityGroup = new vault.identity.Group(
        `${resourceName}-${slug}`,
        {
          name: groupName,
          type: 'external',
          externalPolicies: true,
          metadata: {
            authentikTier: groupName,
          },
        },
        vaultProviderOpts,
      );

      const oidcAliasDependsOn: pulumi.Resource[] = [identityGroup];
      if (previousAlias) {
        oidcAliasDependsOn.push(previousAlias);
      }

      const oidcAlias = new vault.identity.GroupAlias(
        `${resourceName}-${slug}-oidcAlias`,
        {
          name: groupName,
          mountAccessor: args.oidcMountAccessor,
          canonicalId: identityGroup.id,
        },
        {
          ...vaultProviderOpts,
          dependsOn: oidcAliasDependsOn,
        },
      );

      const jwtAlias = new vault.identity.GroupAlias(
        `${resourceName}-${slug}-coderJwtAlias`,
        {
          name: groupName,
          mountAccessor: args.coderJwtMountAccessor,
          canonicalId: identityGroup.id,
        },
        {
          ...vaultProviderOpts,
          dependsOn: [identityGroup, oidcAlias],
        },
      );

      previousAlias = jwtAlias;
      identityGroupIds[groupName] = identityGroup.id;

      if (groupName === 'System Manager') {
        new vault.identity.GroupPolicies(
          `${resourceName}-${slug}-oidcKvPolicies`,
          {
            groupId: identityGroup.id,
            exclusive: false,
            policies: [args.oidcKvPolicyName],
          },
          {
            ...vaultProviderOpts,
            dependsOn: [identityGroup],
          },
        );
      }
    }

    return {
      output: pulumi.output({
        identityGroupIds,
      }),
      secret: pulumi.secret({}),
    };
  },
);
