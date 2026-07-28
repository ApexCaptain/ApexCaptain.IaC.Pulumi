import { authentik } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';

interface ArgoAuthentikComponentArgsShape {
  hosts: {
    argoCd: string;
    authentik: string;
  };
  authentik: {
    /**
     * Argo CD SSO 로그인 최소 그룹.
     * 이 그룹(및 하위)만 Authentik Application 접근 가능.
     */
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

export type ArgoAuthentikComponentArgs =
  utils.types.DeepPulumiInput<ArgoAuthentikComponentArgsShape>;

export const ArgoAuthentikComponent = utils.functions.defineComponent(
  'argoAuthentik',
  async (
    args: ArgoAuthentikComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const providerOpts = { ...opts, provider: args.providers.authentik };
    const argoApplicationSlug = 'argocd';
    const argoOidcClientId = 'argocd';
    const argoOidcGroupsClaim = 'argocd_groups';
    const argoOidcGroupsScopeName = 'argocd_groups';

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

    const groupsScopeMapping = new authentik.PropertyMappingProviderScope(
      `${resourceName}-groupsScopeMapping`,
      {
        name: 'argocd-oidc-groups-scope',
        scopeName: argoOidcGroupsScopeName,
        description: 'OIDC groups claim for Argo CD RBAC',
        expression: `return {\n  "${argoOidcGroupsClaim}": sorted({group.name for group in request.user.ak_groups.all()}),\n}`,
      },
      providerOpts,
    );

    const signingKey = await authentik.getCertificateKeyPair(
      { name: 'authentik Self-signed Certificate' },
      providerOpts,
    );

    const argoOauth2Provider = new authentik.ProviderOauth2(
      `${resourceName}-argoOauth2Provider`,
      {
        name: 'argocd-authentik-oidc-provider',
        clientId: argoOidcClientId,
        authorizationFlow: args.authentik.flow.authorizationFlowId,
        invalidationFlow: args.authentik.flow.invalidationFlowId,
        allowedRedirectUris: [
          {
            matching_mode: 'strict',
            redirect_uri_type: 'authorization',
            url: pulumi.interpolate`https://${args.hosts.argoCd}/auth/callback`,
          },
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
        signingKey: signingKey.id,
      },
      {
        ...providerOpts,
        dependsOn: [groupsScopeMapping],
      },
    );

    const argoAuthentikApplication = new authentik.Application(
      `${resourceName}-argoAuthentikApplication`,
      {
        name: 'argocd',
        slug: argoApplicationSlug,
        protocolProvider: argoOauth2Provider.id.apply(id => parseInt(id)),
        metaLaunchUrl: pulumi.interpolate`https://${args.hosts.argoCd}/`,
      },
      providerOpts,
    );

    new authentik.PolicyBinding(
      `${resourceName}-argoAuthentikApplicationGroupBinding`,
      {
        target: argoAuthentikApplication.uuid,
        group: args.authentik.allowedGroupId,
        order: 0,
      },
      providerOpts,
    );

    const issuerUrl = pulumi.interpolate`https://${args.hosts.authentik}/application/o/${argoApplicationSlug}/`;

    return {
      output: pulumi.output({
        oidc: {
          name: 'Authentik',
          issuerUrl,
          groupsClaim: argoOidcGroupsClaim,
          requestedScopes: [
            'openid',
            'profile',
            'email',
            argoOidcGroupsScopeName,
          ],
        },
      }),
      secret: pulumi.secret({
        oidc: {
          clientId: argoOauth2Provider.clientId,
          clientSecret: argoOauth2Provider.clientSecret,
        },
      }),
    };
  },
);
