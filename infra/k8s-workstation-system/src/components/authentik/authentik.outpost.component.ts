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
