/**
 * VictoriaMetrics single — Prometheus-compatible metrics backend
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface VictoriaMetricsHelmChartComponentArgsShape {
  namespace: string;
  storageClassName: string;
  helm: {
    victoriaMetrics: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type VictoriaMetricsHelmChartComponentArgs =
  utils.types.DeepPulumiInput<VictoriaMetricsHelmChartComponentArgsShape>;

export const VictoriaMetricsHelmChartComponent = utils.functions.defineComponent(
  'victoriaMetricsHelmChart',
  (
    args: VictoriaMetricsHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    new kubernetes.helm.v3.Release(
      `${resourceName}-release`,
      {
        name: 'victoria-metrics',
        chart: 'victoria-metrics-single',
        version: args.helm.victoriaMetrics.version,
        namespace: args.namespace,
        repositoryOpts: {
          repo: args.helm.victoriaMetrics.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          server: {
            retentionPeriod: '15d',
            persistentVolume: {
              enabled: true,
              storageClassName: args.storageClassName,
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
          victoriaMetrics: {
            name: 'victoria-metrics-victoria-metrics-single-server',
            port: {
              http: 8428,
            },
          },
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
