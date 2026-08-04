import { authentik } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';

interface CoderAuthentikComponentArgsShape {
  hosts: {
    coder: string;
    authentik: string;
  };
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

export type CoderAuthentikComponentArgs =
  utils.types.DeepPulumiInput<CoderAuthentikComponentArgsShape>;

export const CoderAuthentikComponent = utils.functions.defineComponent(
  'coderAuthentik',
  async (
    args: CoderAuthentikComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const providerOpts = { ...opts, provider: args.providers.authentik };
    const coderApplicationSlug = 'coder';
    const coderOidcClientId = 'coder';

    const [openidScope, profileScope, emailScope, offlineAccessScope] =
      await Promise.all([
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
        authentik.getPropertyMappingProviderScope(
          { scopeName: 'offline_access' },
          providerOpts,
        ),
      ]);

    const coderOidcSigningKey = await authentik.getCertificateKeyPair(
      { name: 'authentik Self-signed Certificate' },
      providerOpts,
    );

    const coderOauth2Provider = new authentik.ProviderOauth2(
      `${resourceName}-coderOauth2Provider`,
      {
        name: 'coder-authentik-oidc-provider',
        clientId: coderOidcClientId,
        authorizationFlow: args.authentik.flow.authorizationFlowId,
        invalidationFlow: args.authentik.flow.invalidationFlowId,
        allowedRedirectUris: [
          {
            matching_mode: 'strict',
            redirect_uri_type: 'authorization',
            url: pulumi.interpolate`https://${args.hosts.coder}/api/v2/users/oidc/callback`,
          },
        ],
        clientType: 'confidential',
        grantTypes: ['authorization_code', 'refresh_token'],
        propertyMappings: [
          openidScope.id,
          profileScope.id,
          emailScope.id,
          offlineAccessScope.id,
        ],
        subMode: 'user_email',
        includeClaimsInIdToken: true,
        signingKey: coderOidcSigningKey.id,
      },
      providerOpts,
    );

    const coderAuthentikApplication = new authentik.Application(
      `${resourceName}-coderAuthentikApplication`,
      {
        name: 'coder',
        slug: coderApplicationSlug,
        protocolProvider: coderOauth2Provider.id.apply(id => parseInt(id)),
        metaLaunchUrl: pulumi.interpolate`https://${args.hosts.coder}/`,
      },
      providerOpts,
    );

    new authentik.PolicyBinding(
      `${resourceName}-coderAuthentikApplicationGroupBinding`,
      {
        target: coderAuthentikApplication.uuid,
        group: args.authentik.allowedGroupId,
        order: 0,
      },
      providerOpts,
    );

    return {
      output: pulumi.output({
        oidc: {
          issuerUrl: pulumi.interpolate`https://${args.hosts.authentik}/application/o/${coderApplicationSlug}/`,
          discoveryUrl: pulumi.interpolate`https://${args.hosts.authentik}/application/o/${coderApplicationSlug}/.well-known/openid-configuration`,
          redirectUrl: pulumi.interpolate`https://${args.hosts.coder}/api/v2/users/oidc/callback`,
        },
      }),
      secret: pulumi.secret({
        oidc: {
          clientId: coderOauth2Provider.clientId,
          clientSecret: coderOauth2Provider.clientSecret,
        },
      }),
    };
  },
);
