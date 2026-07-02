/**
 * Authentik Proxy Outpost (bootstrap)
 *
 * Authentik API는 Outpost 생성 시 protocolProviders가 비어 있으면 거부한다.
 * Longhorn provider 하나를 bootstrap으로 넣고, 이후 앱은 Attachment로 붙인다.
 *
 * `ignoreChanges: ['protocolProviders']` — Pulumi가 bootstrap 목록만 관리하고,
 * Attachment로 늘어난 provider는 Authentik이 소스 오브 트루스.
 */
import { authentik } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';

interface AuthentikOutpostComponentArgsShape {
  outposts: {
    proxy: {
      name: string;
      providerIds: string[];
    };
  };
  host: string;
  serviceConnectionId: string;
  providers: {
    authentik: authentik.Provider;
  };
}

export type AuthentikOutpostComponentArgs =
  utils.types.DeepPulumiInput<AuthentikOutpostComponentArgsShape>;

export const AuthentikOutpostComponent = utils.functions.defineComponent(
  'authentikOutpost',
  (
    args: AuthentikOutpostComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const proxyOutpost = new authentik.Outpost(
      `${resourceName}-proxyOutpost`,
      {
        name: args.outposts.proxy.name,
        type: 'proxy',
        protocolProviders: pulumi
          .output(args.outposts.proxy.providerIds)
          .apply(resolvedProviderIds =>
            resolvedProviderIds.map(eachResolvedProviderId =>
              parseInt(eachResolvedProviderId),
            ),
          ),
        serviceConnection: args.serviceConnectionId,
        config: pulumi.all([args.host]).apply(([resolvedHost]) =>
          JSON.stringify({
            authentik_host: `https://${resolvedHost}`,
          }),
        ),
      },
      {
        ...opts,
        provider: args.providers.authentik,
        ignoreChanges: ['protocolProviders'],
      },
    );

    return {
      output: pulumi.output({
        outpostIds: {
          proxyOutpostId: proxyOutpost.id,
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
