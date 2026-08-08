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
