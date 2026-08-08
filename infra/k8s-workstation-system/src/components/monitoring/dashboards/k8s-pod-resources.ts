/**
 * K8s pod resources dashboard for OTel kubeletstats → VictoriaMetrics.
 * Labels assume prometheusremotewrite resource_to_telemetry_conversion.
 */
export const k8sPodResourcesDashboardJson = JSON.stringify({
  annotations: { list: [] },
  editable: true,
  fiscalYearStartMonth: 0,
  graphTooltip: 1,
  id: null,
  links: [],
  panels: [
    {
      datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
      fieldConfig: {
        defaults: {
          unit: 'percentunit',
          min: 0,
        },
        overrides: [],
      },
      gridPos: { h: 8, w: 12, x: 0, y: 0 },
      id: 1,
      options: {
        legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
        tooltip: { mode: 'multi', sort: 'desc' },
      },
      targets: [
        {
          datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
          expr: 'k8s_pod_cpu_usage{k8s_namespace_name=~"$namespace", k8s_pod_name=~"$pod"}',
          legendFormat: '{{k8s_namespace_name}}/{{k8s_pod_name}}',
          refId: 'A',
        },
      ],
      title: 'Pod CPU usage',
      type: 'timeseries',
    },
    {
      datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
      fieldConfig: {
        defaults: {
          unit: 'bytes',
          min: 0,
        },
        overrides: [],
      },
      gridPos: { h: 8, w: 12, x: 12, y: 0 },
      id: 2,
      options: {
        legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
        tooltip: { mode: 'multi', sort: 'desc' },
      },
      targets: [
        {
          datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
          expr: 'k8s_pod_memory_working_set_bytes{k8s_namespace_name=~"$namespace", k8s_pod_name=~"$pod"}',
          legendFormat: '{{k8s_namespace_name}}/{{k8s_pod_name}}',
          refId: 'A',
        },
      ],
      title: 'Pod memory working set',
      type: 'timeseries',
    },
    {
      datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
      fieldConfig: {
        defaults: {
          unit: 'Bps',
          min: 0,
        },
        overrides: [],
      },
      gridPos: { h: 8, w: 24, x: 0, y: 8 },
      id: 3,
      options: {
        legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
        tooltip: { mode: 'multi', sort: 'desc' },
      },
      targets: [
        {
          datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
          expr: 'rate(k8s_pod_network_io_bytes_total{k8s_namespace_name=~"$namespace", k8s_pod_name=~"$pod"}[5m])',
          legendFormat: '{{k8s_namespace_name}}/{{k8s_pod_name}} {{direction}}',
          refId: 'A',
        },
      ],
      title: 'Pod network IO rate',
      type: 'timeseries',
    },
  ],
  refresh: '30s',
  schemaVersion: 39,
  tags: ['k8s', 'kubeletstats', 'pod'],
  templating: {
    list: [
      {
        current: {},
        datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
        definition: 'label_values(k8s_pod_cpu_usage, k8s_namespace_name)',
        includeAll: true,
        allValue: '.*',
        label: 'namespace',
        multi: true,
        name: 'namespace',
        query: {
          query: 'label_values(k8s_pod_cpu_usage, k8s_namespace_name)',
          refId: 'StandardVariableQuery',
        },
        refresh: 2,
        regex: '',
        type: 'query',
      },
      {
        current: {},
        datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
        definition:
          'label_values(k8s_pod_cpu_usage{k8s_namespace_name=~"$namespace"}, k8s_pod_name)',
        includeAll: true,
        allValue: '.*',
        label: 'pod',
        multi: true,
        name: 'pod',
        query: {
          query:
            'label_values(k8s_pod_cpu_usage{k8s_namespace_name=~"$namespace"}, k8s_pod_name)',
          refId: 'StandardVariableQuery',
        },
        refresh: 2,
        regex: '',
        type: 'query',
      },
    ],
  },
  time: { from: 'now-1h', to: 'now' },
  timepicker: {},
  timezone: 'browser',
  title: 'K8s Pod Resources (kubeletstats)',
  uid: 'k8s-pod-kubeletstats',
  version: 1,
});
