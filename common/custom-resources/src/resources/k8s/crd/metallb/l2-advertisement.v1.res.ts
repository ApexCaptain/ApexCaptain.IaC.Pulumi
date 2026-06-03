import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface L2AdvertisementV1ArgsShape {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    ipAddressPools?: string[];
    ipAddressPoolSelectors?: {
      matchLabels?: Record<string, string>;
      matchExpressions?: {
        key: string;
        operator: string;
        values?: string[];
      }[];
    }[];
    nodeSelectors?: {
      matchLabels?: Record<string, string>;
      matchExpressions?: {
        key: string;
        operator: string;
        values?: string[];
      }[];
    }[];
    interfaces?: string[];
  };
}

export type L2AdvertisementV1Args =
  utils.types.DeepPulumiInput<L2AdvertisementV1ArgsShape>;

export class L2AdvertisementV1 extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: L2AdvertisementV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'metallb.io/v1beta1',
        kind: 'L2Advertisement',
        metadata: args.metadata,
        spec: args.spec,
      },
      opts,
    );
  }
}
