import { authentik } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';

/**
 * Jellyfin ↔ Authentik OIDC 연동 (Authentik IdP 쪽만 Pulumi로 관리).
 *
 * ## 구성 방식
 *
 * Jellyfin은 네이티브 OIDC가 없어 [jellyfin-plugin-sso](https://github.com/9p4/jellyfin-plugin-sso)가
 * 앱 내부에서 authorization code flow를 처리한다. qBittorrent·Longhorn처럼 Istio + Authentik Proxy
 * (Outpost)로 끝낼 수 없고, 플러그인 설치·OIDC 설정·브랜딩·라이브러리 권한은 Jellyfin Admin UI에서
 * 수동으로 해야 한다.
 *
 * 이 컴포넌트는 **Authentik에 OIDC Provider / Application / 그룹 정책만** 선언한다.
 * redirect URI·launch URL은 플러그인 경로(`/sso/OID/...`)에 맞춘다.
 *
 * ```
 * [사용자] → Jellyfin 로그인 (SSO 버튼) → jellyfin-plugin-sso
 *         → Authentik authorize → callback /sso/OID/redirect/{oidcProviderName}
 *         → Jellyfin 세션 생성
 *
 * Authentik PolicyBinding: applicationUserGroup — 누가 SSO 시도할 수 있는지 (IdP)
 * 플러그인 Enable Authorization: SSO 후 Jellyfin 라이브러리 접근 (앱)
 * ```
 *
 * `oidcProviderName`은 플러그인에 등록하는 provider **키**이며, Authentik UI의 provider 표시명과 무관하다.
 * redirect URI·launch URL·플러그인 설정의 Name 필드가 모두 이 값과 같아야 한다.
 *
 * ## Pulumi 배포 후 Jellyfin 수동 설정
 *
 * 1. Plugins → Catalog → repo:
 *    `https://raw.githubusercontent.com/9p4/jellyfin-plugin-sso/manifest-release/manifest.json`
 * 2. SSO-Auth 설치·활성화
 * 3. OID provider: Name = `oidcProviderName`, Endpoint = `output.oidc.discoveryUrl`,
 *    Client ID/Secret = `secret.oidc`, Scheme Override = `https`
 * 4. (선택) Branding 로그인 버튼: `output.oidc.launchUrl`을 form action으로 사용
 *
 * admin 계정은 SSO가 아닌 로컬 로그인으로 두는 것을 권장한다 (SSO 장애 시 복구용).
 */
interface JellyfinAuthentikComponentArgsShape {
  hosts: {
    jellyfin: string;
    authentik: string;
  };
  /** jellyfin-plugin-sso provider 키. redirect·launch URL 및 플러그인 Name과 일치해야 함 */
  oidcProviderName: string;
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

export type JellyfinAuthentikComponentArgs =
  utils.types.DeepPulumiInput<JellyfinAuthentikComponentArgsShape>;

export const JellyfinAuthentikComponent = utils.functions.defineComponent(
  'jellyfinAuthentik',
  async (
    args: JellyfinAuthentikComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const providerOpts = { ...opts, provider: args.providers.authentik };

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

    const jellyfinOauth2Provider = new authentik.ProviderOauth2(
      `${resourceName}-jellyfinOauth2Provider`,
      {
        name: 'jellyfin-authentik-oidc-provider',
        clientId: 'jellyfin',
        authorizationFlow: args.authentik.flow.authorizationFlowId,
        invalidationFlow: args.authentik.flow.invalidationFlowId,
        allowedRedirectUris: [
          {
            // bridged provider가 nested map을 camelCase로 변환하지 않음 — snake_case 필수
            matching_mode: 'strict',
            redirect_uri_type: 'authorization',
            url: pulumi.interpolate`https://${args.hosts.jellyfin}/sso/OID/redirect/${args.oidcProviderName}`,
          },
        ],
        clientType: 'confidential',
        // Authentik 2026.5+: 미설정 시 grant_types=[] → authorization_code flow 거절
        grantTypes: ['authorization_code', 'refresh_token'],
        propertyMappings: [openidScope.id, profileScope.id, emailScope.id],
        subMode: 'user_email',
        includeClaimsInIdToken: true,
      },
      providerOpts,
    );

    const jellyfinAuthentikApplication = new authentik.Application(
      `${resourceName}-jellyfinAuthentikApplication`,
      {
        name: 'jellyfin',
        slug: 'jellyfin',
        protocolProvider: jellyfinOauth2Provider.id.apply(id => parseInt(id)),
        metaLaunchUrl: pulumi.interpolate`https://${args.hosts.jellyfin}/sso/OID/start/${args.oidcProviderName}`,
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    // applicationUserGroup만 이 Application에 접근 가능 (Authentik 로그인 허용 범위)
    new authentik.PolicyBinding(
      `${resourceName}-jellyfinAuthentikApplicationGroupBinding`,
      {
        target: jellyfinAuthentikApplication.uuid,
        group: args.authentik.allowedGroupId,
        order: 0,
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    return {
      output: pulumi.output({
        oidc: {
          discoveryUrl: pulumi.interpolate`https://${args.hosts.authentik}/application/o/jellyfin/.well-known/openid-configuration`,
          providerName: args.oidcProviderName,
          launchUrl: pulumi.interpolate`https://${args.hosts.jellyfin}/sso/OID/start/${args.oidcProviderName}`,
        },
      }),
      secret: pulumi.secret({
        oidc: {
          clientId: jellyfinOauth2Provider.clientId,
          clientSecret: jellyfinOauth2Provider.clientSecret,
        },
      }),
    };
  },
);
