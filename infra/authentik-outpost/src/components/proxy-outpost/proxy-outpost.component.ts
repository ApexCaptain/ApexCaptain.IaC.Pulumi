import * as utils from '@common/utils/src';
import * as authentik from '@pulumi/authentik';
import * as pulumi from '@pulumi/pulumi';

interface ProxyOutpostComponentArgsShape {
  host: string;
  outpostName: string;
  serviceConnectionId: string;
  providerIds: string[];
  providers: {
    authentik: authentik.Provider;
  };
}

export type ProxyOutpostComponentArgs =
  utils.types.DeepPulumiInput<ProxyOutpostComponentArgsShape>;

export const ProxyOutpostComponent = utils.functions.defineComponent(
  'proxy-outpost',
  (
    args: ProxyOutpostComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const proxyOutpost = new authentik.Outpost(
      `${resourceName}-proxyOutpost`,
      {
        name: args.outpostName,
        type: 'proxy',
        protocolProviders: pulumi
          .output(args.providerIds)
          .apply(resolvedProviderIds =>
            resolvedProviderIds.map(eachResolvedProviderId =>
              parseInt(eachResolvedProviderId),
            ),
          ),
        serviceConnection: args.serviceConnectionId,
        config: pulumi.all([args.host]).apply(([host]) =>
          JSON.stringify({
            authentik_host: `https://${host}`,
          }),
        ),
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
