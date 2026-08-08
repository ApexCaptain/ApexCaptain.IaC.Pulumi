/**
 * OpenTelemetry Collector (DaemonSet) + central Instrumentation CR
 *
 * monitoring NS는 ambient mesh — pod 간 scraping/export는 ztunnel L4 mTLS.
 * kubeletstats(노드 :10250)만 mesh 밖 직접 접근. sidecar.istio.io/inject 미사용.
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import { clusterPrometheusScrapeConfigs } from './prometheus-scrape-configs';

interface OtelResourcesComponentArgsShape {
  namespace: string;
  backends: {
    victoriaMetrics: {
      remoteWriteUrl: string;
    };
    loki: {
      otlpHttpUrl: string;
    };
    tempo: {
      otlpGrpcEndpoint: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type OtelResourcesComponentArgs =
  utils.types.DeepPulumiInput<OtelResourcesComponentArgsShape>;

const collectorServiceAccountName = 'central-collector';
const collectorClusterRoleName = 'central-collector';
const collectorName = 'central-collector';
const instrumentationName = 'central-instrumentation';

export const OtelResourcesComponent = utils.functions.defineComponent(
  'otelResources',
  (
    args: OtelResourcesComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const providerOpts = {
      ...opts,
      provider: args.providers.kubernetes,
    };

    const collectorServiceAccount = new kubernetes.core.v1.ServiceAccount(
      `${resourceName}-collectorServiceAccount`,
      {
        metadata: {
          name: collectorServiceAccountName,
          namespace: args.namespace,
        },
      },
      providerOpts,
    );

    const collectorClusterRole = new kubernetes.rbac.v1.ClusterRole(
      `${resourceName}-collectorClusterRole`,
      {
        metadata: {
          name: collectorClusterRoleName,
        },
        rules: [
          {
            apiGroups: [''],
            resources: ['nodes/stats', 'nodes/proxy', 'nodes/metrics'],
            verbs: ['get', 'list', 'watch'],
          },
          {
            apiGroups: [''],
            resources: ['nodes'],
            verbs: ['get', 'list', 'watch'],
          },
          {
            apiGroups: [''],
            resources: ['pods', 'namespaces', 'services', 'endpoints'],
            verbs: ['get', 'list', 'watch'],
          },
          {
            apiGroups: ['discovery.k8s.io'],
            resources: ['endpointslices'],
            verbs: ['get', 'list', 'watch'],
          },
          {
            apiGroups: ['apps'],
            resources: ['replicasets'],
            verbs: ['get', 'list', 'watch'],
          },
          {
            apiGroups: ['extensions'],
            resources: ['replicasets'],
            verbs: ['get', 'list', 'watch'],
          },
        ],
      },
      providerOpts,
    );

    const collectorClusterRoleBinding =
      new kubernetes.rbac.v1.ClusterRoleBinding(
        `${resourceName}-collectorClusterRoleBinding`,
        {
          metadata: {
            name: collectorClusterRoleName,
          },
          roleRef: {
            apiGroup: 'rbac.authorization.k8s.io',
            kind: 'ClusterRole',
            name: collectorClusterRole.metadata.name,
          },
          subjects: [
            {
              kind: 'ServiceAccount',
              name: collectorServiceAccount.metadata.name,
              namespace: args.namespace,
            },
          ],
        },
        {
          ...providerOpts,
          dependsOn: [collectorServiceAccount, collectorClusterRole],
        },
      );

    const collectorConfig = pulumi
      .all([
        args.backends.victoriaMetrics.remoteWriteUrl,
        args.backends.loki.otlpHttpUrl,
        args.backends.tempo.otlpGrpcEndpoint,
      ])
      .apply(([remoteWriteUrl, otlpHttpUrl, otlpGrpcEndpoint]) => ({
        receivers: {
          otlp: {
            protocols: {
              grpc: {},
              http: {},
            },
          },
          filelog: {
            include: ['/var/log/pods/*/*/*.log'],
            exclude: [],
            start_at: 'end',
            include_file_path: true,
            include_file_name: false,
            operators: [{ type: 'container' }],
          },
          kubeletstats: {
            collection_interval: '30s',
            auth_type: 'serviceAccount',
            endpoint: 'https://${env:K8S_NODE_IP}:10250',
            insecure_skip_verify: true,
          },
          prometheus: {
            config: {
              scrape_configs: [...clusterPrometheusScrapeConfigs],
            },
          },
        },
        processors: {
          memory_limiter: {
            check_interval: '1s',
            limit_percentage: 75,
            spike_limit_percentage: 15,
          },
          k8sattributes: {},
          batch: {},
        },
        exporters: {
          'prometheusremotewrite': {
            endpoint: remoteWriteUrl,
            // in-cluster HTTP VictoriaMetrics — default TLS would fail
            tls: {
              insecure: true,
            },
            // kubeletstats resource attrs → Prom labels (k8s_pod_name, …)
            resource_to_telemetry_conversion: {
              enabled: true,
            },
          },
          'otlphttp/logs': {
            endpoint: otlpHttpUrl,
            tls: {
              insecure: true,
            },
          },
          'otlp/traces': {
            endpoint: otlpGrpcEndpoint,
            // ambient ztunnel이 L4 mTLS — Tempo는 앱 레벨 TLS 없음
            tls: {
              insecure: true,
            },
          },
        },
        service: {
          pipelines: {
            metrics: {
              receivers: ['otlp', 'kubeletstats', 'prometheus'],
              processors: ['memory_limiter', 'k8sattributes', 'batch'],
              exporters: ['prometheusremotewrite'],
            },
            logs: {
              receivers: ['otlp', 'filelog'],
              processors: ['memory_limiter', 'k8sattributes', 'batch'],
              exporters: ['otlphttp/logs'],
            },
            traces: {
              receivers: ['otlp'],
              processors: ['memory_limiter', 'k8sattributes', 'batch'],
              exporters: ['otlp/traces'],
            },
          },
        },
      }));

    const collector = new kubernetes.apiextensions.CustomResource(
      `${resourceName}-centralCollector`,
      {
        apiVersion: 'opentelemetry.io/v1beta1',
        kind: 'OpenTelemetryCollector',
        metadata: {
          name: collectorName,
          namespace: args.namespace,
        },
        spec: {
          mode: 'daemonset',
          serviceAccount: collectorServiceAccountName,
          // k8s distro lacks prometheusremotewrite; contrib matches operator 0.156.0
          image:
            'ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib:0.156.0',
          // ambient: sidecar inject 비활성화 어노테이션 금지 — ztunnel이 L4 mTLS 처리
          podAnnotations: {},
          env: [
            {
              name: 'K8S_NODE_IP',
              valueFrom: {
                fieldRef: {
                  fieldPath: 'status.hostIP',
                },
              },
            },
            {
              name: 'K8S_NODE_NAME',
              valueFrom: {
                fieldRef: {
                  fieldPath: 'spec.nodeName',
                },
              },
            },
          ],
          volumeMounts: [
            {
              name: 'varlogpods',
              mountPath: '/var/log/pods',
              readOnly: true,
            },
          ],
          volumes: [
            {
              name: 'varlogpods',
              hostPath: {
                path: '/var/log/pods',
              },
            },
          ],
          config: collectorConfig,
        },
      },
      {
        ...providerOpts,
        dependsOn: [collectorClusterRoleBinding],
      },
    );

    const instrumentation = new kubernetes.apiextensions.CustomResource(
      `${resourceName}-centralInstrumentation`,
      {
        apiVersion: 'opentelemetry.io/v1alpha1',
        kind: 'Instrumentation',
        metadata: {
          name: instrumentationName,
          namespace: args.namespace,
        },
        spec: {
          exporter: {
            // ambient app NS → monitoring collector: ztunnel L4 mTLS (ClusterIP 경유)
            endpoint: pulumi.interpolate`http://${collectorName}-collector.${args.namespace}.svc.cluster.local:4317`,
          },
          propagators: ['tracecontext', 'baggage'],
          sampler: {
            type: 'parentbased_traceidratio',
            argument: '1',
          },
        },
      },
      {
        ...providerOpts,
        dependsOn: [collector],
      },
    );

    return {
      output: pulumi.output({
        collector: {
          name: collectorName,
        },
        instrumentation: {
          name: instrumentationName,
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
