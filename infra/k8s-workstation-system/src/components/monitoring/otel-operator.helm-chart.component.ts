/**
 * OpenTelemetry Operator Helm — monitoring NS + CRD/controller
 *
 * Namespace는 Istio ambient(`istio.io/dataplane-mode: ambient`) — sidecar 없이
 * ztunnel L4 mTLS. cert-manager webhook 연동. downstream Collector/Instrumentation CR의 전제.
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface OtelOperatorHelmChartComponentArgsShape {
  helm: {
    opentelemetryOperator: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type OtelOperatorHelmChartComponentArgs =
  utils.types.DeepPulumiInput<OtelOperatorHelmChartComponentArgsShape>;

export const OtelOperatorHelmChartComponent = utils.functions.defineComponent(
  'otelOperatorHelmChart',
  (
    args: OtelOperatorHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'monitoring',
          labels: {
            'istio.io/dataplane-mode': 'ambient',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    new kubernetes.helm.v3.Release(
      `${resourceName}-release`,
      {
        name: 'opentelemetry-operator',
        chart: 'opentelemetry-operator',
        version: args.helm.opentelemetryOperator.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.opentelemetryOperator.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          admissionWebhooks: {
            certManager: {
              enabled: true,
            },
          },
          manager: {
            collectorImage: {
              repository:
                'ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-k8s',
            },
            // ambient: sidecar.istio.io/inject 비활성화 어노테이션을 두지 않음
            podAnnotations: {},
            resources: {
              requests: {
                cpu: '50m',
                memory: '128Mi',
              },
              limits: {
                cpu: '500m',
                memory: '512Mi',
              },
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
      output: pulumi.output({
        namespace: namespace.metadata.name,
      }),
      secret: pulumi.secret({}),
    };
  },
);
