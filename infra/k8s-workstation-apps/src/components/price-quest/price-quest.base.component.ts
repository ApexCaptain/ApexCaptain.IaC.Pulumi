import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface PriceQuestBaseComponentArgsShape {
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type PriceQuestBaseComponentArgs =
  utils.types.DeepPulumiInput<PriceQuestBaseComponentArgsShape>;

export const PriceQuestBaseComponent = utils.functions.defineComponent(
  'priceQuestBase',
  (
    args: PriceQuestBaseComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const commonLabels = {
      project: 'price-quest',
      environment: pulumi.getStack(),
    };

    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: `price-quest-${pulumi.getStack()}`,
          labels: {
            ...commonLabels,
            'istio.io/dataplane-mode': 'ambient',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
        projectName: commonLabels.project,
        commonLabels,
      }),
      secret: pulumi.secret({}),
    };
  },
);
