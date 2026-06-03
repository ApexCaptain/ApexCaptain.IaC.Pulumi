import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface MetallbResourcesComponentArgsShape {
  namespace: string;
  ipRange: string;
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type MetallbResourcesComponentArgs =
  utils.types.DeepPulumiInput<MetallbResourcesComponentArgsShape>;

export const MetallbResourcesComponent = utils.functions.defineComponent(
  'metallbResources',
  (
    args: MetallbResourcesComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const ipAddressPool =
      new customResources.resources.k8s.crd.metallb.IpAddressPoolV1(
        `${resourceName}-ipAddressPool`,
        {
          metadata: {
            name: 'ip-address-pool',
            namespace: args.namespace,
          },
          spec: {
            addresses: [args.ipRange],
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    const l2Advertisement =
      new customResources.resources.k8s.crd.metallb.L2AdvertisementV1(
        `${resourceName}-l2Advertisement`,
        {
          metadata: {
            name: 'l2-advertisement',
            namespace: args.namespace,
          },
          spec: {
            ipAddressPools: [ipAddressPool.metadata.name],
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
