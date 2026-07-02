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
 *        → Vault token (OIDC role + Authentik groups → identity group policy)
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

interface VaultAuthentikComponentArgsShape {
  hosts: {
    vault: string;
    authentik: string;
  };
  authentik: {
    /** systemUserGroup — bind 대상 + descendants(systemManager)만 Vault SSO 시도 가능 */
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

    const groupsScopeMapping = new authentik.PropertyMappingProviderScope(
      `${resourceName}-groupsScopeMapping`,
      {
        name: 'vault-oidc-groups-scope',
        scopeName: vaultOidcGroupsClaim,
        description: 'OIDC groups claim for Vault identity group alias',
        expression: `return {\n  "${vaultOidcGroupsClaim}": [group.name for group in request.user.ak_groups.all()],\n}`,
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
        ],
        subMode: 'user_email',
        includeClaimsInIdToken: true,
        signingKey: vaultOidcSigningKey.id,
      },
      {
        ...authentikProviderOpts,
        dependsOn: [groupsScopeMapping],
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
        oidcScopes: [vaultOidcGroupsClaim],
        tokenPolicies: ['default'],
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
