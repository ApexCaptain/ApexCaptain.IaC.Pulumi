import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import * as components from '../components';
import { SystemProviders } from './providers';

/** DB·캐시 오퍼레이터. CR(Cluster·Redis)은 사용하는 phase·스택·GitOps가 만든다. */
export const deployDataOperators = (deps: { providers: SystemProviders }) => {
  const commonEsc = nexus.esc.commonEsc;
  const { workstationK8sProvider } = deps.providers;

  // PostgreSQL Operator
  const postgresqlOperatorHelmChart =
    new components.postgresqlOperator.PostgreSQLOperatorHelmChartComponent(
      'postgresqlOperatorHelmChart',
      {
        helm: {
          postgresqlOperator: {
            version: utils.configs.helmChartVersions.postgresqlOperator,
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls[
                'cloudnative-pg.github.io/charts'
              ],
          },
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
    );

  // Redis Operator — Redis CR은 앱/GitOps에서 생성
  const redisOperatorHelmChart =
    new components.redisOperator.RedisOperatorHelmChartComponent(
      'redisOperatorHelmChart',
      {
        helm: {
          redisOperator: {
            version: utils.configs.helmChartVersions.redisOperator,
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls[
                'ot-container-kit.github.io/helm-charts'
              ],
          },
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
    );

  return { postgresqlOperatorHelmChart, redisOperatorHelmChart };
};

export type DataOperatorsPhase = ReturnType<typeof deployDataOperators>;
