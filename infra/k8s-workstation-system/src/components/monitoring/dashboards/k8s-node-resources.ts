/**
 * K8s node resources dashboard for OTel kubeletstats → VictoriaMetrics.
 * Labels assume prometheusremotewrite resource_to_telemetry_conversion.
 */
export const k8sNodeResourcesDashboardJson = JSON.stringify({
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
          expr: 'k8s_node_cpu_usage{k8s_node_name=~"$node"}',
          legendFormat: '{{k8s_node_name}}',
          refId: 'A',
        },
      ],
      title: 'Node CPU usage',
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
          expr: 'k8s_node_memory_working_set_bytes{k8s_node_name=~"$node"}',
          legendFormat: 'working_set {{k8s_node_name}}',
          refId: 'A',
        },
        {
          datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
          expr: 'k8s_node_memory_usage_bytes{k8s_node_name=~"$node"}',
          legendFormat: 'usage {{k8s_node_name}}',
          refId: 'B',
        },
      ],
      title: 'Node memory',
      type: 'timeseries',
    },
    {
      datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
      fieldConfig: {
        defaults: {
          unit: 'percentunit',
          min: 0,
          max: 1,
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
          expr: 'k8s_node_filesystem_usage_bytes{k8s_node_name=~"$node"} / clamp_min(k8s_node_filesystem_capacity_bytes{k8s_node_name=~"$node"}, 1)',
          legendFormat: '{{k8s_node_name}} {{k8s_volume_name}}',
          refId: 'A',
        },
      ],
      title: 'Node filesystem usage ratio',
      type: 'timeseries',
    },
  ],
  refresh: '30s',
  schemaVersion: 39,
  tags: ['k8s', 'kubeletstats', 'node'],
  templating: {
    list: [
      {
        current: {},
        datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
        definition: 'label_values(k8s_node_cpu_usage, k8s_node_name)',
        includeAll: true,
        allValue: '.*',
        label: 'node',
        multi: true,
        name: 'node',
        query: {
          query: 'label_values(k8s_node_cpu_usage, k8s_node_name)',
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
  title: 'K8s Node Resources (kubeletstats)',
  uid: 'k8s-node-kubeletstats',
  version: 1,
});
