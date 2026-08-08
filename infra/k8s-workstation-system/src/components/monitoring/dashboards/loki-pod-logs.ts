/**
 * Loki pod logs dashboard — matches OTEL filelog labels
 * (k8s_namespace_name, k8s_pod_name, k8s_container_name, service_name).
 */
export const lokiPodLogsDashboardJson = JSON.stringify({
  annotations: { list: [] },
  editable: true,
  fiscalYearStartMonth: 0,
  graphTooltip: 1,
  id: null,
  links: [],
  panels: [
    {
      datasource: { type: 'loki', uid: 'Loki' },
      gridPos: { h: 4, w: 24, x: 0, y: 0 },
      id: 1,
      options: {
        dedupStrategy: 'none',
        enableLogDetails: true,
        prettifyLogMessage: false,
        showCommonLabels: false,
        showLabels: false,
        showTime: true,
        sortOrder: 'Descending',
        wrapLogMessage: true,
      },
      targets: [
        {
          datasource: { type: 'loki', uid: 'Loki' },
          editorMode: 'code',
          expr: '{k8s_namespace_name=~"$namespace", k8s_pod_name=~"$pod", k8s_container_name=~"$container"} |= `$search`',
          queryType: 'range',
          refId: 'A',
        },
      ],
      title: 'Pod logs',
      type: 'logs',
    },
    {
      datasource: { type: 'loki', uid: 'Loki' },
      fieldConfig: {
        defaults: {
          custom: {
            drawStyle: 'bars',
            fillOpacity: 80,
            stacking: { mode: 'normal', group: 'A' },
          },
          unit: 'short',
        },
        overrides: [],
      },
      gridPos: { h: 8, w: 24, x: 0, y: 4 },
      id: 2,
      options: {
        legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
        tooltip: { mode: 'multi', sort: 'desc' },
      },
      targets: [
        {
          datasource: { type: 'loki', uid: 'Loki' },
          editorMode: 'code',
          expr: 'sum by (k8s_pod_name) (count_over_time({k8s_namespace_name=~"$namespace", k8s_pod_name=~"$pod", k8s_container_name=~"$container"} |= `$search` [$__auto]))',
          legendFormat: '{{k8s_pod_name}}',
          queryType: 'range',
          refId: 'A',
        },
      ],
      title: 'Log volume',
      type: 'timeseries',
    },
  ],
  refresh: '30s',
  schemaVersion: 39,
  tags: ['loki', 'logs', 'k8s'],
  templating: {
    list: [
      {
        current: {},
        datasource: { type: 'loki', uid: 'Loki' },
        definition: 'label_values(k8s_namespace_name)',
        includeAll: true,
        allValue: '.+',
        label: 'namespace',
        multi: true,
        name: 'namespace',
        query: 'label_values(k8s_namespace_name)',
        refresh: 2,
        type: 'query',
      },
      {
        current: {},
        datasource: { type: 'loki', uid: 'Loki' },
        definition:
          'label_values({k8s_namespace_name=~"$namespace"}, k8s_pod_name)',
        includeAll: true,
        allValue: '.+',
        label: 'pod',
        multi: true,
        name: 'pod',
        query: 'label_values({k8s_namespace_name=~"$namespace"}, k8s_pod_name)',
        refresh: 2,
        type: 'query',
      },
      {
        current: {},
        datasource: { type: 'loki', uid: 'Loki' },
        definition:
          'label_values({k8s_namespace_name=~"$namespace", k8s_pod_name=~"$pod"}, k8s_container_name)',
        includeAll: true,
        allValue: '.+',
        label: 'container',
        multi: true,
        name: 'container',
        query:
          'label_values({k8s_namespace_name=~"$namespace", k8s_pod_name=~"$pod"}, k8s_container_name)',
        refresh: 2,
        type: 'query',
      },
      {
        current: { selected: false, text: '', value: '' },
        label: 'search',
        name: 'search',
        query: '',
        type: 'textbox',
      },
    ],
  },
  time: { from: 'now-1h', to: 'now' },
  timepicker: {},
  timezone: 'browser',
  title: 'K8s Pod Logs',
  uid: 'loki-k8s-pod-logs',
  version: 1,
});
