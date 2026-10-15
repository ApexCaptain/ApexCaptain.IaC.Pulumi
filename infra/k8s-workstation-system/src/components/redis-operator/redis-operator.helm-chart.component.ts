/**
 * OT-CONTAINER-KIT Redis Operator.
 * Redis CR은 여기 두지 않는다. 앱이 이 오퍼레이터를 사용한다.
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface RedisOperatorHelmChartComponentArgsShape {
  helm: {
    redisOperator: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type RedisOperatorHelmChartComponentArgs =
  utils.types.DeepPulumiInput<RedisOperatorHelmChartComponentArgsShape>;

export const RedisOperatorHelmChartComponent = utils.functions.defineComponent(
  'redisOperatorHelmChart',
  (
    args: RedisOperatorHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'redis-operator',
          labels: {
            'app.kubernetes.io/name': 'redis-operator',
            'app.kubernetes.io/part-of': 'k8s-workstation-system',
            'goldilocks.fairwinds.com/enabled': 'true',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    new kubernetes.helm.v3.Release(
      `${resourceName}-redis-operator-helm-chart-release`,
      {
        name: 'redis-operator',
        chart: 'redis-operator',
        version: args.helm.redisOperator.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.redisOperator.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          redisOperator: {
            webhook: false,
          },
          resources: {
            requests: {
              cpu: '25m',
              memory: '128Mi',
            },
            limits: {
              cpu: '200m',
              memory: '256Mi',
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [namespace],
      },
    );

    return {
      output: pulumi.output({}),
      secret: pulumi.output({}),
    };
  },
);
