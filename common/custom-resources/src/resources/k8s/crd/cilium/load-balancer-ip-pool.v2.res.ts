import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface LabelSelectorShape {
  matchLabels?: Record<string, string>;
  matchExpressions?: {
    key: string;
    operator: string;
    values?: string[];
  }[];
}

interface LoadBalancerIpPoolV2ArgsShape {
  metadata: {
    name: string;
  };
  spec: {
    allowFirstLastIPs?: 'Yes' | 'No';
    blocks?: {
      cidr?: string;
      start?: string;
      stop?: string;
    }[];
    disabled?: boolean;
    serviceSelector?: LabelSelectorShape;
  };
}

export type LoadBalancerIpPoolV2Args =
  utils.types.DeepPulumiInput<LoadBalancerIpPoolV2ArgsShape>;

export class LoadBalancerIpPoolV2 extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: LoadBalancerIpPoolV2Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'cilium.io/v2',
        kind: 'CiliumLoadBalancerIPPool',
        ...args,
      },
      opts,
    );
  }
}
