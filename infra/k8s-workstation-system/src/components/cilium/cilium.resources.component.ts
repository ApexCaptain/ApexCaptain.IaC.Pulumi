/**
 * Cilium L2 announcement
 *
 * on-prem LB Service에 외부 IP를 붙이려면 L2AnnouncementPolicy가 필요하다.
 * Istio ingress gateway `loadBalancerIP`가 여기서 실제로 announce 된다.
 */
import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface CiliumResourcesComponentArgsShape {
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type CiliumResourcesComponentArgs =
  utils.types.DeepPulumiInput<CiliumResourcesComponentArgsShape>;

export const CiliumResourcesComponent = utils.functions.defineComponent(
  'ciliumResources',
  (
    args: CiliumResourcesComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const l2AnnouncementPolicy =
      new customResources.resources.k8s.crd.cilium.L2AnnouncementPolicyV2Alpha1(
        `${resourceName}-l2AnnouncementPolicy`,
        {
          metadata: {
            name: 'l2-announcement-policy',
          },
          spec: {
            loadBalancerIPs: true,
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    return {
      output: pulumi.output({
        l2AnnouncementPolicyName: l2AnnouncementPolicy.metadata.name,
      }),
      secret: pulumi.secret({}),
    };
  },
);
