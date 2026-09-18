/**
 * OpenTelemetry Operator Helm — monitoring 네임스페이스 + CRD/컨트롤러
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
            // 컨트롤러는 기동 시 apiserver discovery 다수 — ambient ztunnel 경로에서 TLS timeout 재현됨 (VPA/Argo와 동일하게 mesh 밖)
            podAnnotations: {
              'istio.io/dataplane-mode': 'none',
            },
            featureGatesMap: {
              'operator.networkpolicy': false,
              'operand.networkpolicy': false,
            },
            resources: {
              requests: {
                cpu: '200m',
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
