/**
 * Grafana Tempo — single binary local storage + PVC
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface TempoHelmChartComponentArgsShape {
  namespace: string;
  storageClassName: string;
  helm: {
    tempo: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type TempoHelmChartComponentArgs =
  utils.types.DeepPulumiInput<TempoHelmChartComponentArgsShape>;

export const TempoHelmChartComponent = utils.functions.defineComponent(
  'tempoHelmChart',
  (
    args: TempoHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    new kubernetes.helm.v3.Release(
      `${resourceName}-release`,
      {
        name: 'tempo',
        chart: 'tempo',
        version: args.helm.tempo.version,
        namespace: args.namespace,
        repositoryOpts: {
          repo: args.helm.tempo.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          tempo: {
            retention: '72h',
            storage: {
              trace: {
                backend: 'local',
                local: {
                  path: '/var/tempo/traces',
                },
              },
            },
          },
          persistence: {
            enabled: true,
            storageClassName: args.storageClassName,
            size: '10Gi',
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
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    return {
      output: pulumi.output({
        services: {
          tempo: {
            name: 'tempo',
            port: {
              query: 3200,
              otlpGrpc: 4317,
              otlpHttp: 4318,
            },
          },
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
