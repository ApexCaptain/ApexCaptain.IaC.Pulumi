import { authentik } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';

/**
 * Vikunja ↔ Authentik OIDC (IdP 쪽만 Pulumi).
 *
 * Jellyfin과 달리 Vikunja는 네이티브 OIDC — 플러그인·Admin UI 설정 없이
 * Helm config.yml + env로 앱 쪽을 선언한다.
 *
 * ```
 * [사용자] → Vikunja 로그인 → Authentik authorize
 *         → callback /auth/openid/{providerKey}
 *         → POST /api/v1/auth/openid/{providerKey}/callback → Vikunja JWT
 *
 * Authentik PolicyBinding: allowedGroup — SSO 시도 가능한 사용자 (IdP)
 * Vikunja auth.local.enabled: false — 로컬 로그인 차단 (Helm)
 * ```
 *
 * `oidcProviderKey`는 Vikunja config의 provider key이며 redirect URI 경로와 일치해야 한다.
 * client id/secret은 secret 출력 → Helm의 vikunja-oidc-secret + env 주입.
 */
interface VikunjaAuthentikComponentArgsShape {
  hosts: {
    vikunja: string;
    authentik: string;
  };
  /**
   * Vikunja auth.openid.providers 의 provider key.
   * 예: authentik -> redirect URI: /auth/openid/authentik
   */
  oidcProviderKey: string;
  authentik: {
    allowedGroupId: string;
    flow: {
      authorizationFlowId: string;
      invalidationFlowId: string;
    };
  };
  providers: {
    authentik: authentik.Provider;
  };
}

export type VikunjaAuthentikComponentArgs =
  utils.types.DeepPulumiInput<VikunjaAuthentikComponentArgsShape>;

export const VikunjaAuthentikComponent = utils.functions.defineComponent(
  'vikunjaAuthentik',
  async (
    args: VikunjaAuthentikComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const providerOpts = { ...opts, provider: args.providers.authentik };
    const vikunjaApplicationSlug = 'vikunja';
    const vikunjaOidcClientId = 'vikunja';
    const vikunjaProviderKey = pulumi
      .output(args.oidcProviderKey)
      .apply(value => value.toLowerCase().replace(/\s+/g, ''));

    // Authentik 2026.5+: scope mapping 없으면 토큰 scope가 비어 userinfo 403
    const [openidScope, profileScope, emailScope] = await Promise.all([
      authentik.getPropertyMappingProviderScope(
        { scopeName: 'openid' },
        providerOpts,
      ),
      authentik.getPropertyMappingProviderScope(
        { scopeName: 'profile' },
        providerOpts,
      ),
      authentik.getPropertyMappingProviderScope(
        { scopeName: 'email' },
        providerOpts,
      ),
    ]);

    // Signing Key 없으면 id_token이 HS256(client secret)으로 나올 수 있음.
    // Vikunja OIDC 검증은 RS256(JWKS) 흐름을 기대하므로 signingKey를 명시한다.
    const vikunjaOidcSigningKey = await authentik.getCertificateKeyPair(
      { name: 'authentik Self-signed Certificate' },
      providerOpts,
    );

    const vikunjaOauth2Provider = new authentik.ProviderOauth2(
      `${resourceName}-vikunjaOauth2Provider`,
      {
        name: 'vikunja-authentik-oidc-provider',
        clientId: vikunjaOidcClientId,
        authorizationFlow: args.authentik.flow.authorizationFlowId,
        invalidationFlow: args.authentik.flow.invalidationFlowId,
        allowedRedirectUris: [
          {
            // bridged provider가 nested map을 camelCase로 변환하지 않음 — snake_case 필수
            matching_mode: 'strict',
            redirect_uri_type: 'authorization',
            url: pulumi.interpolate`https://${args.hosts.vikunja}/auth/openid/${vikunjaProviderKey}`,
          },
        ],
        clientType: 'confidential',
        grantTypes: ['authorization_code', 'refresh_token'],
        propertyMappings: [openidScope.id, profileScope.id, emailScope.id],
        subMode: 'user_email',
        includeClaimsInIdToken: true,
        signingKey: vikunjaOidcSigningKey.id,
      },
      providerOpts,
    );

    const vikunjaAuthentikApplication = new authentik.Application(
      `${resourceName}-vikunjaAuthentikApplication`,
      {
        name: 'vikunja',
        slug: vikunjaApplicationSlug,
        protocolProvider: vikunjaOauth2Provider.id.apply(id => parseInt(id)),
        metaLaunchUrl: pulumi.interpolate`https://${args.hosts.vikunja}/`,
      },
      providerOpts,
    );

    // allowedGroup만 이 Application에 접근 가능 (Authentik 로그인 허용 범위)
    new authentik.PolicyBinding(
      `${resourceName}-vikunjaAuthentikApplicationGroupBinding`,
      {
        target: vikunjaAuthentikApplication.uuid,
        group: args.authentik.allowedGroupId,
        order: 0,
      },
      providerOpts,
    );

    return {
      output: pulumi.output({
        oidc: {
          providerKey: vikunjaProviderKey,
          discoveryUrl: pulumi.interpolate`https://${args.hosts.authentik}/application/o/${vikunjaApplicationSlug}/.well-known/openid-configuration`,
          authUrl: pulumi.interpolate`https://${args.hosts.authentik}/application/o/${vikunjaApplicationSlug}/`,
          redirectUrl: pulumi.interpolate`https://${args.hosts.vikunja}/auth/openid/${vikunjaProviderKey}`,
        },
      }),
      secret: pulumi.secret({
        oidc: {
          clientId: vikunjaOauth2Provider.clientId,
          clientSecret: vikunjaOauth2Provider.clientSecret,
        },
      }),
    };
  },
);
