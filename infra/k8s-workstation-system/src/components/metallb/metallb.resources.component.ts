import * as nexus from '@common/nexus/src';
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

export const MetallbResourcesComponent = nexus.function.defineComponent(
  'metallbResources',
  (
    args: MetallbResourcesComponentArgs,
    opts: pulumi.ComponentResourceOptions,
  ) => {
    const ipAddressPool = new kubernetes.apiextensions.CustomResource(
      'ipAddressPool',
      {
        apiVersion: 'metallb.io/v1beta1',
        kind: 'IPAddressPool',
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

    const l2Advertisement = new kubernetes.apiextensions.CustomResource(
      'l2Advertisement',
      {
        apiVersion: 'metallb.io/v1beta1',
        kind: 'L2Advertisement',
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
