import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface IpAddressPoolV1ArgsShape {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    addresses: string[];
    autoAssign?: boolean;
    avoidBuggyIPs?: boolean;
    serviceAllocation?: {
      namespaces?: string[];
      namespaceSelectors?: {
        matchLabels?: Record<string, string>;
        matchExpressions?: {
          key: string;
          operator: string;
          values?: string[];
        }[];
      }[];
      serviceSelectors?: {
        matchLabels?: Record<string, string>;
        matchExpressions?: {
          key: string;
          operator: string;
          values?: string[];
        }[];
      }[];
    };
  };
}

export type IpAddressPoolV1Args =
  utils.types.DeepPulumiInput<IpAddressPoolV1ArgsShape>;

export class IpAddressPoolV1 extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: IpAddressPoolV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'metallb.io/v1beta1',
        kind: 'IPAddressPool',
        ...args,
      },
      opts,
    );
  }
}
