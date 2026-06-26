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

interface L2AnnouncementPolicyV2Alpha1ArgsShape {
  metadata: {
    name: string;
  };
  spec: {
    externalIPs?: boolean;
    loadBalancerIPs?: boolean;
    interfaces?: string[];
    nodeSelector?: LabelSelectorShape;
    serviceSelector?: LabelSelectorShape;
  };
}

export type L2AnnouncementPolicyV2Alpha1Args =
  utils.types.DeepPulumiInput<L2AnnouncementPolicyV2Alpha1ArgsShape>;

export class L2AnnouncementPolicyV2Alpha1 extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: L2AnnouncementPolicyV2Alpha1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'cilium.io/v2alpha1',
        kind: 'CiliumL2AnnouncementPolicy',
        ...args,
      },
      opts,
    );
  }
}
