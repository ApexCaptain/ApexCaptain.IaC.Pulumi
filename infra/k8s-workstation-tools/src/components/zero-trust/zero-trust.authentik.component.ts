import { authentik } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';

/**
 * Cloudflare Zero Trust ↔ Authentik OIDC (IdP 쪽).
 *
 * Cloudflare Access가 WARP 기기 등록·재인증 때 Authentik으로 로그인시킨다.
 * MFA는 Authentik 인증 flow의 mfa-validation stage가 담당한다.
 *
 * ```
 * [WARP 로그인] → <team>.cloudflareaccess.com → Authentik authorize (+MFA)
 *              → callback /cdn-cgi/access/callback → WARP 세션
 *
 * Authentik PolicyBinding: allowedGroup — 로그인 자체를 허용할 그룹
 * Cloudflare Access/Gateway 정책: email — 기기 등록·네트워크 허용 (zero-trust.access/gateway)
 * ```
 */
interface ZeroTrustAuthentikComponentArgsShape {
  hosts: {
    authentik: string;
  };
  /** Cloudflare Zero Trust team 이름 (`<teamName>.cloudflareaccess.com`) */
  teamName: string;
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

export type ZeroTrustAuthentikComponentArgs =
  utils.types.DeepPulumiInput<ZeroTrustAuthentikComponentArgsShape>;

export const ZeroTrustAuthentikComponent = utils.functions.defineComponent(
  'zeroTrustAuthentik',
  async (
    args: ZeroTrustAuthentikComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const providerOpts = { ...opts, provider: args.providers.authentik };
    const applicationSlug = 'cloudflare-zero-trust';
    const oidcClientId = 'cloudflare-zero-trust';

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

    // Signing Key 없으면 JWKS가 비어 Cloudflare의 id_token 검증(certs_url)이 실패한다
    const oidcSigningKey = await authentik.getCertificateKeyPair(
      { name: 'authentik Self-signed Certificate' },
      providerOpts,
    );

    const oauth2Provider = new authentik.ProviderOauth2(
      `${resourceName}-oauth2Provider`,
      {
        name: 'cloudflare-zero-trust-authentik-oidc-provider',
        clientId: oidcClientId,
        authorizationFlow: args.authentik.flow.authorizationFlowId,
        invalidationFlow: args.authentik.flow.invalidationFlowId,
        allowedRedirectUris: [
          {
            // bridged provider가 nested map을 camelCase로 변환하지 않음 — snake_case 필수
            matching_mode: 'strict',
            redirect_uri_type: 'authorization',
            url: pulumi.interpolate`https://${args.teamName}.cloudflareaccess.com/cdn-cgi/access/callback`,
          },
        ],
        clientType: 'confidential',
        grantTypes: ['authorization_code', 'refresh_token'],
        propertyMappings: [openidScope.id, profileScope.id, emailScope.id],
        subMode: 'user_email',
        includeClaimsInIdToken: true,
        signingKey: oidcSigningKey.id,
      },
      providerOpts,
    );

    const authentikApplication = new authentik.Application(
      `${resourceName}-authentikApplication`,
      {
        name: 'cloudflare-zero-trust',
        slug: applicationSlug,
        protocolProvider: oauth2Provider.id.apply(id => parseInt(id)),
        metaLaunchUrl: pulumi.interpolate`https://${args.teamName}.cloudflareaccess.com/`,
      },
      providerOpts,
    );

    // allowedGroup만 Cloudflare Zero Trust에 로그인 가능
    new authentik.PolicyBinding(
      `${resourceName}-authentikApplicationGroupBinding`,
      {
        target: authentikApplication.uuid,
        group: args.authentik.allowedGroupId,
        order: 0,
      },
      providerOpts,
    );

    return {
      output: pulumi.output({
        oidc: {
          issuerUrl: pulumi.interpolate`https://${args.hosts.authentik}/application/o/${applicationSlug}/`,
          authUrl: pulumi.interpolate`https://${args.hosts.authentik}/application/o/authorize/`,
          tokenUrl: pulumi.interpolate`https://${args.hosts.authentik}/application/o/token/`,
          certsUrl: pulumi.interpolate`https://${args.hosts.authentik}/application/o/${applicationSlug}/jwks/`,
        },
      }),
      secret: pulumi.secret({
        oidc: {
          clientId: oauth2Provider.clientId,
          clientSecret: oauth2Provider.clientSecret,
        },
      }),
    };
  },
);
