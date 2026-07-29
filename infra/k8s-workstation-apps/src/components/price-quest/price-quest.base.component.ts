/**
 * Price Quest 기반 인프라 — namespace, CNPG PostgreSQL (mTLS 테스트용).
 *
 * 테스트 전용: DB 자격 증명은 평문. PG pod는 ambient mesh에 포함(Vikunja의 `none` 제외 없음).
 * CNPG operator(postgresql-operator NS)의 :8000 status scrape는
 * PeerAuthentication( namespace STRICT + PG pod :8000 예외 ) + AuthorizationPolicy로 허용한다.
 */
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

/** k8s-workstation-system/postgresql-operator Helm chart namespace */
const cnpgOperatorNamespace = 'postgresql-operator';

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
