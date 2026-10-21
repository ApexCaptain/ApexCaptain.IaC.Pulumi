/**
 * Vault OIDC 로그인 가능한 Authentik 티어와 1:1인 Vault external identity group.
 *
 * Vault 앱 bind는 System User(+ 자식 System Manager)만.
 * Application/Tools 티어는 Vault에 못 들어오므로 identity group을 만들지 않는다.
 *
 * External group은 alias를 하나만 가진다 (두 번째 alias를 만들면 첫 alias가 지워진다).
 * 그래서 티어마다 마운트별 external group(OIDC, Coder JWT)을 따로 두고,
 * 정책은 둘을 member로 갖는 internal group에 붙인다. 하위 group 멤버는 상위 정책을 상속한다.
 * @see https://developer.hashicorp.com/vault/docs/concepts/identity#external-vs-internal-groups
 *
 * GroupAlias 이름은 OIDC/JWT `groups` 클레임과 같아야 하고, 마운트당 하나다.
 * SftpV3와 vault-oidc-kv는 System Manager internal group에만 붙인다
 * (GroupPolicies exclusive=false). `identityGroupIds`는 internal group id다.
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
      // OIDC 마운트용 external group. 기존 리소스(이름 `groupName`)를 그대로 쓴다.
      const oidcGroup = new vault.identity.Group(
        `${resourceName}-${slug}`,
        {
          name: groupName,
          type: 'external',
          externalPolicies: true,
          metadata: {
            authentikTier: groupName,
            mount: 'oidc',
          },
        },
        vaultProviderOpts,
      );

      const coderJwtGroup = new vault.identity.Group(
        `${resourceName}-${slug}-coderJwt`,
        {
          name: `${groupName} (Coder JWT)`,
          type: 'external',
          externalPolicies: true,
          metadata: {
            authentikTier: groupName,
            mount: 'coder-jwt',
          },
        },
        vaultProviderOpts,
      );

      const policyGroup = new vault.identity.Group(
        `${resourceName}-${slug}-policies`,
        {
          name: `${groupName} (Policies)`,
          type: 'internal',
          externalPolicies: true,
          memberGroupIds: [oidcGroup.id, coderJwtGroup.id],
          metadata: {
            authentikTier: groupName,
          },
        },
        vaultProviderOpts,
      );

      const jwtAliasDependsOn: pulumi.Resource[] = [coderJwtGroup];
      if (previousAlias) {
        jwtAliasDependsOn.push(previousAlias);
      }

      // 기존 alias를 OIDC group에서 떼어 Coder JWT group으로 옮긴 뒤 OIDC alias를 만든다.
      // 순서가 바뀌면 OIDC alias 생성이 아직 OIDC group에 붙은 JWT alias를 지운다.
      const jwtAlias = new vault.identity.GroupAlias(
        `${resourceName}-${slug}-coderJwtAlias`,
        {
          name: groupName,
          mountAccessor: args.coderJwtMountAccessor,
          canonicalId: coderJwtGroup.id,
        },
        {
          ...vaultProviderOpts,
          dependsOn: jwtAliasDependsOn,
        },
      );

      const oidcAlias = new vault.identity.GroupAlias(
        `${resourceName}-${slug}-oidcAlias`,
        {
          name: groupName,
          mountAccessor: args.oidcMountAccessor,
          canonicalId: oidcGroup.id,
        },
        {
          ...vaultProviderOpts,
          dependsOn: [oidcGroup, jwtAlias],
        },
      );

      previousAlias = oidcAlias;
      identityGroupIds[groupName] = policyGroup.id;

      if (groupName === 'System Manager') {
        new vault.identity.GroupPolicies(
          `${resourceName}-${slug}-oidcKvPolicies`,
          {
            groupId: policyGroup.id,
            exclusive: false,
            policies: [args.oidcKvPolicyName],
          },
          {
            ...vaultProviderOpts,
            dependsOn: [policyGroup],
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
