/**
 * Grafana Loki — SingleBinary + filesystem PVC
 * OTLP ingest is built-in at /otlp (no distributor.otlp config — invalid in Loki 3.x)
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface LokiHelmChartComponentArgsShape {
  namespace: string;
  storageClassName: string;
  helm: {
    loki: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type LokiHelmChartComponentArgs =
  utils.types.DeepPulumiInput<LokiHelmChartComponentArgsShape>;

export const LokiHelmChartComponent = utils.functions.defineComponent(
  'lokiHelmChart',
  (
    args: LokiHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    new kubernetes.helm.v3.Release(
      `${resourceName}-release`,
      {
        name: 'loki',
        chart: 'loki',
        version: args.helm.loki.version,
        namespace: args.namespace,
        repositoryOpts: {
          repo: args.helm.loki.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          deploymentMode: 'SingleBinary',
          loki: {
            auth_enabled: false,
            commonConfig: {
              replication_factor: 1,
            },
            storage: {
              type: 'filesystem',
            },
            schemaConfig: {
              configs: [
                {
                  from: '2024-01-01',
                  store: 'tsdb',
                  object_store: 'filesystem',
                  schema: 'v13',
                  index: {
                    prefix: 'loki_index_',
                    period: '24h',
                  },
                },
              ],
            },
            storage_config: {
              filesystem: {
                directory: '/var/loki/chunks',
              },
            },
            limits_config: {
              retention_period: '168h',
            },
          },
          singleBinary: {
            replicas: 1,
            persistence: {
              enabled: true,
              storageClass: args.storageClassName,
              size: '20Gi',
            },
            resources: {
              requests: {
                cpu: '100m',
                memory: '256Mi',
              },
              limits: {
                cpu: '1000m',
                memory: '1Gi',
              },
            },
          },
          // Helm 기본 allocatedMemory는 chunks 8192MB / results 1024MB.
          // 실제 RSS는 각각 ~200Mi / ~30Mi라서 스케줄 request만 수 Gi를 잡아먹음.
          // allocatedMemory를 낮춰야 memcached -m과 k8s request(×1.2)가 같이 줄어든다.
          chunksCache: {
            allocatedMemory: 512,
          },
          resultsCache: {
            allocatedMemory: 128,
          },
          gateway: {
            enabled: false,
          },
          read: {
            replicas: 0,
          },
          write: {
            replicas: 0,
          },
          backend: {
            replicas: 0,
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
        services: {
          loki: {
            name: 'loki',
            port: {
              http: 3100,
            },
          },
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
