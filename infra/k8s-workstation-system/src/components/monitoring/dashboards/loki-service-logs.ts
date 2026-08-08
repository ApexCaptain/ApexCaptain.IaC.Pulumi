/**
 * Loki logs by service_name — matches OTEL filelog / k8sattributes labels.
 */
export const lokiServiceLogsDashboardJson = JSON.stringify({
  annotations: { list: [] },
  editable: true,
  fiscalYearStartMonth: 0,
  graphTooltip: 1,
  id: null,
  links: [],
  panels: [
    {
      datasource: { type: 'loki', uid: 'Loki' },
      gridPos: { h: 12, w: 24, x: 0, y: 0 },
      id: 1,
      options: {
        dedupStrategy: 'none',
        enableLogDetails: true,
        prettifyLogMessage: false,
        showCommonLabels: true,
        showLabels: false,
        showTime: true,
        sortOrder: 'Descending',
        wrapLogMessage: true,
      },
      targets: [
        {
          datasource: { type: 'loki', uid: 'Loki' },
          editorMode: 'code',
          expr: '{service_name=~"$service", k8s_namespace_name=~"$namespace"} |= `$search`',
          queryType: 'range',
          refId: 'A',
        },
      ],
      title: 'Service logs',
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
      gridPos: { h: 8, w: 24, x: 0, y: 12 },
      id: 2,
      options: {
        legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
        tooltip: { mode: 'multi', sort: 'desc' },
      },
      targets: [
        {
          datasource: { type: 'loki', uid: 'Loki' },
          editorMode: 'code',
          expr: 'sum by (service_name) (count_over_time({service_name=~"$service", k8s_namespace_name=~"$namespace"} |= `$search` [$__auto]))',
          legendFormat: '{{service_name}}',
          queryType: 'range',
          refId: 'A',
        },
      ],
      title: 'Log volume by service',
      type: 'timeseries',
    },
  ],
  refresh: '30s',
  schemaVersion: 39,
  tags: ['loki', 'logs', 'service'],
  templating: {
    list: [
      {
        current: {},
        datasource: { type: 'loki', uid: 'Loki' },
        definition: 'label_values(service_name)',
        includeAll: true,
        allValue: '.+',
        label: 'service',
        multi: true,
        name: 'service',
        query: 'label_values(service_name)',
        refresh: 2,
        type: 'query',
      },
      {
        current: {},
        datasource: { type: 'loki', uid: 'Loki' },
        definition:
          'label_values({service_name=~"$service"}, k8s_namespace_name)',
        includeAll: true,
        allValue: '.+',
        label: 'namespace',
        multi: true,
        name: 'namespace',
        query:
          'label_values({service_name=~"$service"}, k8s_namespace_name)',
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
  title: 'Logs / Service',
  uid: 'loki-service-logs',
  version: 1,
});
