import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface IpAddressPoolV1CrdArgsShape {
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

export type IpAddressPoolV1CrdArgs =
  utils.types.DeepPulumiInput<IpAddressPoolV1CrdArgsShape>;

export class IpAddressPoolV1Crd extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: IpAddressPoolV1CrdArgs,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'metallb.io/v1beta1',
        kind: 'IPAddressPool',
        metadata: args.metadata,
        spec: args.spec,
      },
      opts,
    );
  }
}
