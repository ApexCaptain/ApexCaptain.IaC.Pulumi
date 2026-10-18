/**
 * Cloudflare Zero Trust Access — 조직, Authentik IdP, WARP 기기 등록, 기본 디바이스 프로필.
 *
 * - Organization·기본 디바이스 프로필은 계정 싱글턴. provider Create가 Update/Edit API라 import 없이 갱신한다.
 * - Split Tunnel은 Include 모드 — 지정한 대상만 WARP로, 일반 인터넷은 그대로.
 * - Gateway proxy(TCP/UDP)는 계정 기본값으로 이미 켜져 있어 여기서 관리하지 않는다.
 *
 * @see docs/superpowers/specs/2026-10-18-cloudflare-zero-trust-rdp-design.md
 */
import * as utils from '@common/utils/src';
import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';

interface ZeroTrustAccessComponentArgsShape {
  accountId: string;
  teamName: string;
  /** WARP 재인증 주기 (예: `24h`) */
  warpAuthSessionDuration: string;
  identityProvider: {
    clientId: string;
    clientSecret: string;
    authUrl: string;
    tokenUrl: string;
    certsUrl: string;
  };
  allowedEmails: string[];
  splitTunnelIncludes: {
    address?: string;
    host?: string;
    description: string;
  }[];
  providers: {
    cloudflare: cloudflare.Provider;
  };
}

export type ZeroTrustAccessComponentArgs =
  utils.types.DeepPulumiInput<ZeroTrustAccessComponentArgsShape>;

export const ZeroTrustAccessComponent = utils.functions.defineComponent(
  'zeroTrustAccess',
  (
    args: ZeroTrustAccessComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const providerOpts = { ...opts, provider: args.providers.cloudflare };

    new cloudflare.ZeroTrustOrganization(
      `${resourceName}-organization`,
      {
        accountId: args.accountId,
        name: args.teamName,
        authDomain: pulumi.interpolate`${args.teamName}.cloudflareaccess.com`,
        warpAuthSessionDuration: args.warpAuthSessionDuration,
      },
      providerOpts,
    );

    const authentikIdentityProvider =
      new cloudflare.ZeroTrustAccessIdentityProvider(
        `${resourceName}-authentikIdentityProvider`,
        {
          accountId: args.accountId,
          name: 'Authentik',
          type: 'oidc',
          config: {
            clientId: args.identityProvider.clientId,
            clientSecret: args.identityProvider.clientSecret,
            authUrl: args.identityProvider.authUrl,
            tokenUrl: args.identityProvider.tokenUrl,
            certsUrl: args.identityProvider.certsUrl,
            scopes: ['openid', 'profile', 'email'],
            pkceEnabled: true,
          },
        },
        providerOpts,
      );

    const deviceEnrollmentPolicy = new cloudflare.ZeroTrustAccessPolicy(
      `${resourceName}-deviceEnrollmentPolicy`,
      {
        accountId: args.accountId,
        name: 'Allow WARP device enrollment',
        decision: 'allow',
        includes: pulumi
          .output(args.allowedEmails)
          .apply(emails => emails.map(email => ({ email: { email } }))),
      },
      providerOpts,
    );

    // WARP 기기 등록 권한 — Authentik IdP로만 로그인
    new cloudflare.ZeroTrustAccessApplication(
      `${resourceName}-deviceEnrollmentApplication`,
      {
        accountId: args.accountId,
        type: 'warp',
        name: 'Warp Login App',
        allowedIdps: [authentikIdentityProvider.id],
        autoRedirectToIdentity: true,
        policies: [
          {
            id: deviceEnrollmentPolicy.id,
            precedence: 1,
          },
        ],
      },
      providerOpts,
    );

    new cloudflare.ZeroTrustDeviceDefaultProfile(
      `${resourceName}-deviceDefaultProfile`,
      {
        accountId: args.accountId,
        includes: args.splitTunnelIncludes,
      },
      providerOpts,
    );

    return {
      output: pulumi.output({
        identityProviderId: authentikIdentityProvider.id,
      }),
      secret: pulumi.secret({}),
    };
  },
);
