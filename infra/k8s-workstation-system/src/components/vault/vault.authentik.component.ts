/**
 * Vault ↔ Authentik OIDC
 *
 * Jellyfin과 달리 Vault는 OIDC client를 스스로 돌린다.
 * Authentik ProviderOauth2 + Application + PolicyBinding,
 * Vault jwt.AuthBackend(type: oidc) + AuthBackendRole 을 한 컴포넌트에서 맞춘다.
 *
 * ```
 * [사용자] Vault UI → Sign in with OIDC
 *        → Authentik (systemUser+ 만 Application bind)
 *        → callback /ui/vault/auth/oidc/oidc/callback
 *        → Vault token (OIDC role: default + vault-oidc-kv. Authentik bind는 System Manager)
 *
 * [CLI] vault login -method=oidc
 *        → Authentik (동일 MFA)
 *        → callback http://localhost:8250/oidc/callback (또는 127.0.0.1)
 *        → ~/.vault-token
 * ```
 *
 */
import { authentik } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
import dedent from 'dedent';

/** OIDC role이 발급하는 Vault client token TTL (3일) */
const vaultTokenTtlSeconds = 3 * 24 * 3600;

interface VaultAuthentikComponentArgsShape {
  hosts: {
    vault: string;
    authentik: string;
  };
  authentik: {
    /** systemManagerGroup — Vault SSO + KV browse. SSO 자체도 Manager만. System User는 로그인 대상 아님 */
    allowedGroupId: string;
    flow: {
      authorizationFlowId: string;
      invalidationFlowId: string;
    };
  };
  providers: {
    vault: vault.Provider;
    authentik: authentik.Provider;
  };
  vault: {
    oidcKvPolicyName: string;
  };
}

export type VaultAuthentikComponentArgs =
  utils.types.DeepPulumiInput<VaultAuthentikComponentArgsShape>;

export const VaultAuthentikComponent = utils.functions.defineComponent(
  'vaultAuthentik',
  async (
    args: VaultAuthentikComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const vaultApplicationSlug = 'vault';
    const vaultOidcClientId = 'vault';
    const vaultOidcMountPath = 'oidc';
    const vaultOidcRoleName = 'default';
    /** Authentik groups scope → id_token claim 이름 (Vault groupsClaim과 동일해야 함) */
    const vaultOidcGroupsClaim = 'groups';
    const vaultOidcGroupsScopeName = 'vault_groups';

    const authentikProviderOpts = {
      ...opts,
      provider: args.providers.authentik,
    };
    const vaultProviderOpts = { ...opts, provider: args.providers.vault };

    const vaultOidcUiCallbackUrl = pulumi.interpolate`https://${args.hosts.vault}/ui/vault/auth/${vaultOidcMountPath}/${vaultOidcMountPath}/callback`;
    /** Vault CLI OIDC — AuthBackendRole·Authentik allowedRedirectUris 양쪽에 동일해야 함 */
    const vaultOidcCliCallbackUrls = [
      'http://localhost:8250/oidc/callback',
      'http://127.0.0.1:8250/oidc/callback',
    ] as const;
    const vaultOidcDiscoveryUrl = pulumi.interpolate`https://${args.hosts.authentik}/application/o/${vaultApplicationSlug}/`;
    const vaultOidcBoundIssuer = vaultOidcDiscoveryUrl;

    // Authentik 2026.5+: scope mapping 없으면 토큰 scope가 비어 userinfo 403
    // openid/profile/email은 기본 제공, groups는 커스텀 scope mapping을 IaC로 생성
    const [openidScope, profileScope, emailScope] = await Promise.all([
      authentik.getPropertyMappingProviderScope(
        { scopeName: 'openid' },
        authentikProviderOpts,
      ),
      authentik.getPropertyMappingProviderScope(
        { scopeName: 'profile' },
        authentikProviderOpts,
      ),
      authentik.getPropertyMappingProviderScope(
        { scopeName: 'email' },
        authentikProviderOpts,
      ),
    ]);

    /** Authentik 2026.2+: User.ak_groups deprecated, User.groups 가 SSOT */
    const vaultOidcGroupsExpression = dedent`
      u = user if user is not None else request.user
      gs = getattr(u, "groups", None) or u.ak_groups
      return {
        "${vaultOidcGroupsClaim}": sorted({g.name for g in gs.all()}),
      }
    `;

    const groupsScopeMapping = new authentik.PropertyMappingProviderScope(
      `${resourceName}-groupsScopeMapping`,
      {
        name: 'vault-oidc-groups-scope',
        scopeName: vaultOidcGroupsScopeName,
        description: 'OIDC groups claim for Vault identity group alias',
        expression: vaultOidcGroupsExpression,
      },
      authentikProviderOpts,
    );

    const groupsInProfileMapping = new authentik.PropertyMappingProviderScope(
      `${resourceName}-groupsInProfileMapping`,
      {
        name: 'vault-oidc-groups-in-profile',
        scopeName: 'profile',
        description:
          'Same groups claim on profile so id_token always carries it',
        expression: vaultOidcGroupsExpression,
      },
      authentikProviderOpts,
    );

    // Signing Key 없으면 id_token이 HS256(client secret) → Vault OIDC는 RS256(JWKS)만 허용
    const vaultOidcSigningKey = await authentik.getCertificateKeyPair(
      { name: 'authentik Self-signed Certificate' },
      authentikProviderOpts,
    );

    const vaultOauth2Provider = new authentik.ProviderOauth2(
      `${resourceName}-vaultOauth2Provider`,
      {
        name: 'vault-authentik-oidc-provider',
        clientId: vaultOidcClientId,
        authorizationFlow: args.authentik.flow.authorizationFlowId,
        invalidationFlow: args.authentik.flow.invalidationFlowId,
        allowedRedirectUris: [
          {
            matching_mode: 'strict',
            redirect_uri_type: 'authorization',
            url: vaultOidcUiCallbackUrl,
          },
          ...vaultOidcCliCallbackUrls.map(url => ({
            matching_mode: 'strict' as const,
            redirect_uri_type: 'authorization' as const,
            url,
          })),
        ],
        clientType: 'confidential',
        grantTypes: ['authorization_code', 'refresh_token'],
        propertyMappings: [
          openidScope.id,
          profileScope.id,
          emailScope.id,
          groupsScopeMapping.id,
          groupsInProfileMapping.id,
        ],
        subMode: 'user_email',
        includeClaimsInIdToken: true,
        signingKey: vaultOidcSigningKey.id,
      },
      {
        ...authentikProviderOpts,
        dependsOn: [groupsScopeMapping, groupsInProfileMapping],
      },
    );

    const vaultAuthentikApplication = new authentik.Application(
      `${resourceName}-vaultAuthentikApplication`,
      {
        name: 'vault',
        slug: vaultApplicationSlug,
        protocolProvider: vaultOauth2Provider.id.apply(id => parseInt(id)),
        metaLaunchUrl: pulumi.interpolate`https://${args.hosts.vault}/ui/`,
      },
      authentikProviderOpts,
    );

    new authentik.PolicyBinding(
      `${resourceName}-vaultAuthentikApplicationGroupBinding`,
      {
        target: vaultAuthentikApplication.uuid,
        group: args.authentik.allowedGroupId,
        order: 0,
      },
      authentikProviderOpts,
    );

    const vaultOidcAuthBackend = new vault.jwt.AuthBackend(
      `${resourceName}-vaultOidcAuthBackend`,
      {
        path: vaultOidcMountPath,
        type: 'oidc',
        description: 'Authentik OIDC',
        oidcDiscoveryUrl: vaultOidcDiscoveryUrl,
        oidcClientId: vaultOauth2Provider.clientId,
        oidcClientSecret: vaultOauth2Provider.clientSecret,
        boundIssuer: vaultOidcBoundIssuer,
        defaultRole: vaultOidcRoleName,
        tune: {
          listingVisibility: 'unauth',
        },
      },
      {
        ...vaultProviderOpts,
        dependsOn: [vaultOauth2Provider, vaultAuthentikApplication],
      },
    );

    /** SecretV1과 동일: Authentik 그룹 이름 = Vault GroupAlias 이름 = JWT groups */
    const sftpReaderGroupName =
      'vault-reader-group-sftp-qbittorrent-sftp-adapter';
    const systemManagerGroup = authentik.getGroupOutput(
      {
        name: 'System Manager',
        includeUsers: true,
      },
      authentikProviderOpts,
    );
    const sftpReaderAuthentikGroup = new authentik.Group(
      `${resourceName}-sftpReaderAuthentikGroup`,
      {
        name: sftpReaderGroupName,
        users: systemManagerGroup.users,
      },
      authentikProviderOpts,
    );
    const sftpReaderVaultGroup = new vault.identity.Group(
      `${resourceName}-sftpReaderVaultGroup`,
      {
        name: sftpReaderGroupName,
        type: 'external',
        policies: [args.vault.oidcKvPolicyName],
      },
      vaultProviderOpts,
    );
    new vault.identity.GroupAlias(
      `${resourceName}-sftpReaderOidcAlias`,
      {
        name: sftpReaderGroupName,
        mountAccessor: vaultOidcAuthBackend.accessor,
        canonicalId: sftpReaderVaultGroup.id,
      },
      {
        ...vaultProviderOpts,
        dependsOn: [
          sftpReaderVaultGroup,
          sftpReaderAuthentikGroup,
          vaultOidcAuthBackend,
        ],
      },
    );

    new vault.jwt.AuthBackendRole(
      `${resourceName}-vaultOidcAuthBackendRole`,
      {
        backend: vaultOidcMountPath,
        roleName: vaultOidcRoleName,
        roleType: 'oidc',
        userClaim: 'sub',
        boundAudiences: [vaultOidcClientId],
        allowedRedirectUris: [
          vaultOidcUiCallbackUrl,
          ...vaultOidcCliCallbackUrls,
        ],
        groupsClaim: vaultOidcGroupsClaim,
        oidcScopes: [
          'openid',
          'profile',
          'email',
          vaultOidcGroupsScopeName,
        ],
        tokenPolicies: pulumi
          .output(args.vault.oidcKvPolicyName)
          .apply(oidcKvPolicyName => ['default', oidcKvPolicyName]),
        tokenTtl: vaultTokenTtlSeconds,
        tokenMaxTtl: vaultTokenTtlSeconds,
      },
      {
        ...vaultProviderOpts,
        dependsOn: [vaultOidcAuthBackend],
      },
    );

    return {
      output: pulumi.output({
        oidc: {
          mountPath: vaultOidcMountPath,
          mountAccessor: vaultOidcAuthBackend.accessor,
          roleName: vaultOidcRoleName,
          groupsClaim: vaultOidcGroupsClaim,
          discoveryUrl: pulumi.interpolate`https://${args.hosts.authentik}/application/o/${vaultApplicationSlug}/.well-known/openid-configuration`,
          uiCallbackUrl: vaultOidcUiCallbackUrl,
        },
      }),
      secret: pulumi.secret({
        oidc: {
          clientId: vaultOauth2Provider.clientId,
          clientSecret: vaultOauth2Provider.clientSecret,
        },
      }),
    };
  },
);
