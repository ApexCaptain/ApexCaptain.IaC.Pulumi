/**
 * Vault ↔ Authentik Coder JWT
 *
 * Coder workspace agent가 owner OIDC access token(JWT)으로 Vault에 login.
 * Vault UI/CLI OIDC(`auth/oidc`, client `vault`)와 별도 mount — issuer는 Authentik `coder` app.
 *
 * ```
 * [workspace start] coder_script → auth/jwt/login (role: coder-workspace)
 *        → Vault token (groups claim → identity group alias, mount accessor: jwt)
 * ```
 */
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';

/** Authentik access token + Vault client token TTL (3 days) */
const vaultTokenTtlSeconds = 3 * 24 * 3600;

interface VaultCoderJwtComponentArgsShape {
  hosts: {
    authentik: string;
  };
  /** Vault JWT login 허용 Authentik group display name (bound_claims OR) */
  allowedGroupNames: string[];
  providers: {
    vault: vault.Provider;
  };
}

export type VaultCoderJwtComponentArgs =
  utils.types.DeepPulumiInput<VaultCoderJwtComponentArgsShape>;

export const VaultCoderJwtComponent = utils.functions.defineComponent(
  'vaultCoderJwt',
  (
    args: VaultCoderJwtComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const coderApplicationSlug = 'coder';
    const coderOidcClientId = 'coder';
    const coderJwtMountPath = 'jwt';
    const coderJwtRoleName = 'coder-workspace';
    const coderOidcGroupsClaim = 'groups';

    const vaultProviderOpts = { ...opts, provider: args.providers.vault };

    const coderOidcDiscoveryUrl = pulumi.interpolate`https://${args.hosts.authentik}/application/o/${coderApplicationSlug}/`;

    const coderJwtAuthBackend = new vault.jwt.AuthBackend(
      `${resourceName}-coderJwtAuthBackend`,
      {
        path: coderJwtMountPath,
        description: 'Authentik Coder OIDC JWT for Coder workspaces',
        oidcDiscoveryUrl: coderOidcDiscoveryUrl,
        boundIssuer: coderOidcDiscoveryUrl,
        tune: {
          listingVisibility: 'unauth',
        },
      },
      vaultProviderOpts,
    );

    new vault.jwt.AuthBackendRole(
      `${resourceName}-coderJwtAuthBackendRole`,
      {
        backend: coderJwtMountPath,
        roleName: coderJwtRoleName,
        roleType: 'jwt',
        userClaim: 'sub',
        boundAudiences: [coderOidcClientId],
        groupsClaim: coderOidcGroupsClaim,
        boundClaims: pulumi.output(args.allowedGroupNames).apply(groupNames => ({
          [coderOidcGroupsClaim]: groupNames.join(','),
        })),
        boundClaimsType: 'string',
        tokenPolicies: ['default'],
        tokenTtl: vaultTokenTtlSeconds,
        tokenMaxTtl: vaultTokenTtlSeconds,
      },
      {
        ...vaultProviderOpts,
        dependsOn: [coderJwtAuthBackend],
      },
    );

    return {
      output: pulumi.output({
        jwt: {
          mountPath: coderJwtMountPath,
          mountAccessor: coderJwtAuthBackend.accessor,
          roleName: coderJwtRoleName,
          groupsClaim: coderOidcGroupsClaim,
          discoveryUrl: pulumi.interpolate`https://${args.hosts.authentik}/application/o/${coderApplicationSlug}/.well-known/openid-configuration`,
          tokenTtlSeconds: vaultTokenTtlSeconds,
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
