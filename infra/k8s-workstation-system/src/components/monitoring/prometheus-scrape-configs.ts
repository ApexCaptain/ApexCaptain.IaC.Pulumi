/**
 * Prometheus scrape jobs for cluster services that expose /metrics.
 * Prefer container port names ending in metrics / monitoring.
 * Extra jobs cover ports without those names (Longhorn, Grafana, VM, Reloader, Vault).
 */
export const clusterPrometheusScrapeConfigs = [
  {
    job_name: 'kubernetes-pods-metrics-ports',
    scrape_interval: '30s',
    kubernetes_sd_configs: [{ role: 'pod' }],
    relabel_configs: [
      {
        source_labels: ['__meta_kubernetes_pod_phase'],
        regex: 'Pending|Succeeded|Failed|Completed',
        action: 'drop',
      },
      {
        source_labels: ['__meta_kubernetes_pod_container_port_name'],
        regex:
          'metrics|http-metrics|http-monitoring|prometheus|tempo-prom-metrics|monitoring',
        action: 'keep',
      },
      {
        source_labels: ['__meta_kubernetes_namespace'],
        action: 'replace',
        target_label: 'namespace',
      },
      {
        source_labels: ['__meta_kubernetes_pod_name'],
        action: 'replace',
        target_label: 'pod',
      },
      {
        source_labels: ['__meta_kubernetes_pod_container_name'],
        action: 'replace',
        target_label: 'container',
      },
      {
        source_labels: ['__meta_kubernetes_pod_container_port_name'],
        action: 'replace',
        target_label: 'endpoint',
      },
    ],
  },
  {
    job_name: 'longhorn-manager',
    scrape_interval: '30s',
    kubernetes_sd_configs: [
      {
        role: 'pod',
        namespaces: { names: ['longhorn'] },
      },
    ],
    relabel_configs: [
      {
        source_labels: ['__meta_kubernetes_pod_label_app'],
        regex: 'longhorn-manager',
        action: 'keep',
      },
      {
        source_labels: ['__meta_kubernetes_pod_container_port_name'],
        regex: 'manager',
        action: 'keep',
      },
      {
        source_labels: ['__meta_kubernetes_namespace'],
        action: 'replace',
        target_label: 'namespace',
      },
      {
        source_labels: ['__meta_kubernetes_pod_name'],
        action: 'replace',
        target_label: 'pod',
      },
    ],
  },
  {
    job_name: 'grafana',
    scrape_interval: '30s',
    metrics_path: '/metrics',
    kubernetes_sd_configs: [
      {
        role: 'pod',
        namespaces: { names: ['monitoring'] },
      },
    ],
    relabel_configs: [
      {
        source_labels: ['__meta_kubernetes_pod_label_app_kubernetes_io_name'],
        regex: 'grafana',
        action: 'keep',
      },
      {
        source_labels: ['__meta_kubernetes_pod_container_port_name'],
        regex: 'grafana',
        action: 'keep',
      },
      {
        source_labels: ['__meta_kubernetes_namespace'],
        action: 'replace',
        target_label: 'namespace',
      },
      {
        source_labels: ['__meta_kubernetes_pod_name'],
        action: 'replace',
        target_label: 'pod',
      },
    ],
  },
  {
    job_name: 'victoria-metrics',
    scrape_interval: '30s',
    metrics_path: '/metrics',
    kubernetes_sd_configs: [
      {
        role: 'pod',
        namespaces: { names: ['monitoring'] },
      },
    ],
    relabel_configs: [
      {
        source_labels: ['__meta_kubernetes_pod_label_app_kubernetes_io_name'],
        regex: 'victoria-metrics-single',
        action: 'keep',
      },
      {
        source_labels: ['__meta_kubernetes_pod_container_port_name'],
        regex: 'http',
        action: 'keep',
      },
      {
        source_labels: ['__meta_kubernetes_namespace'],
        action: 'replace',
        target_label: 'namespace',
      },
      {
        source_labels: ['__meta_kubernetes_pod_name'],
        action: 'replace',
        target_label: 'pod',
      },
    ],
  },
  {
    job_name: 'reloader',
    scrape_interval: '30s',
    metrics_path: '/metrics',
    kubernetes_sd_configs: [
      {
        role: 'pod',
        namespaces: { names: ['reloader'] },
      },
    ],
    relabel_configs: [
      {
        source_labels: ['__meta_kubernetes_pod_label_app'],
        regex: 'reloader-reloader',
        action: 'keep',
      },
      {
        source_labels: ['__meta_kubernetes_pod_container_port_name'],
        regex: 'http',
        action: 'keep',
      },
      {
        source_labels: ['__meta_kubernetes_namespace'],
        action: 'replace',
        target_label: 'namespace',
      },
      {
        source_labels: ['__meta_kubernetes_pod_name'],
        action: 'replace',
        target_label: 'pod',
      },
    ],
  },
  {
    job_name: 'vault',
    scrape_interval: '30s',
    scheme: 'https',
    metrics_path: '/v1/sys/metrics',
    params: {
      format: ['prometheus'],
    },
    tls_config: {
      insecure_skip_verify: true,
    },
    kubernetes_sd_configs: [
      {
        role: 'pod',
        namespaces: { names: ['vault'] },
      },
    ],
    relabel_configs: [
      {
        source_labels: ['__meta_kubernetes_pod_label_app_kubernetes_io_name'],
        regex: 'vault',
        action: 'keep',
      },
      {
        source_labels: ['__meta_kubernetes_pod_label_component'],
        regex: 'server',
        action: 'keep',
      },
      {
        source_labels: ['__meta_kubernetes_pod_ip'],
        regex: '(.+)',
        replacement: '$1:8200',
        target_label: '__address__',
      },
      {
        source_labels: ['__meta_kubernetes_namespace'],
        action: 'replace',
        target_label: 'namespace',
      },
      {
        source_labels: ['__meta_kubernetes_pod_name'],
        action: 'replace',
        target_label: 'pod',
      },
    ],
  },
] as const;
