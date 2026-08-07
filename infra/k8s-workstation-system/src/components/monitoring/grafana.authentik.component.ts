/**
 * Grafana ↔ Authentik OIDC
 *
 * Application slug `grafana`, groups claim `grafana_groups`.
 * System Manager → Admin, else Viewer (via Grafana role_attribute_path).
 */
import { authentik } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';

interface GrafanaAuthentikComponentArgsShape {
  hosts: {
    grafana: string;
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

export type GrafanaAuthentikComponentArgs =
  utils.types.DeepPulumiInput<GrafanaAuthentikComponentArgsShape>;

export const GrafanaAuthentikComponent = utils.functions.defineComponent(
  'grafanaAuthentik',
  async (
    args: GrafanaAuthentikComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const providerOpts = { ...opts, provider: args.providers.authentik };
    const grafanaApplicationSlug = 'grafana';
    const grafanaOidcClientId = 'grafana';
    const grafanaOidcGroupsClaim = 'grafana_groups';
    const grafanaOidcGroupsScopeName = 'grafana_groups';

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
        name: 'grafana-oidc-groups-scope',
        scopeName: grafanaOidcGroupsScopeName,
        description: 'OIDC groups claim for Grafana RBAC',
        expression: `return {\n  "${grafanaOidcGroupsClaim}": sorted({group.name for group in request.user.ak_groups.all()}),\n}`,
      },
      providerOpts,
    );

    const signingKey = await authentik.getCertificateKeyPair(
      { name: 'authentik Self-signed Certificate' },
      providerOpts,
    );

    const grafanaOauth2Provider = new authentik.ProviderOauth2(
      `${resourceName}-grafanaOauth2Provider`,
      {
        name: 'grafana-authentik-oidc-provider',
        clientId: grafanaOidcClientId,
        authorizationFlow: args.authentik.flow.authorizationFlowId,
        invalidationFlow: args.authentik.flow.invalidationFlowId,
        allowedRedirectUris: [
          {
            matching_mode: 'strict',
            redirect_uri_type: 'authorization',
            url: pulumi.interpolate`https://${args.hosts.grafana}/login/generic_oauth`,
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

    const grafanaAuthentikApplication = new authentik.Application(
      `${resourceName}-grafanaAuthentikApplication`,
      {
        name: 'grafana',
        slug: grafanaApplicationSlug,
        protocolProvider: grafanaOauth2Provider.id.apply(id => parseInt(id)),
        metaLaunchUrl: pulumi.interpolate`https://${args.hosts.grafana}/`,
      },
      providerOpts,
    );

    new authentik.PolicyBinding(
      `${resourceName}-grafanaAuthentikApplicationGroupBinding`,
      {
        target: grafanaAuthentikApplication.uuid,
        group: args.authentik.allowedGroupId,
        order: 0,
      },
      providerOpts,
    );

    const issuerUrl = pulumi.interpolate`https://${args.hosts.authentik}/application/o/${grafanaApplicationSlug}/`;

    return {
      output: pulumi.output({
        oidc: {
          name: 'Authentik',
          issuerUrl,
          groupsClaim: grafanaOidcGroupsClaim,
          requestedScopes: [
            'openid',
            'profile',
            'email',
            grafanaOidcGroupsScopeName,
          ],
          roleAttributePath:
            "contains(grafana_groups[*], 'System Manager') && 'Admin' || 'Viewer'",
        },
      }),
      secret: pulumi.secret({
        oidc: {
          clientId: grafanaOauth2Provider.clientId,
          clientSecret: grafanaOauth2Provider.clientSecret,
        },
      }),
    };
  },
);
