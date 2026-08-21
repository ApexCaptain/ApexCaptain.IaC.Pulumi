/**
 * NVIDIA GPU dashboard for DCGM Exporter (GPU Operator) → VictoriaMetrics.
 * Metrics from nvidia-dcgm-exporter DaemonSet (dcp-metrics-included.csv).
 */
export const nvidiaGpuDcgmDashboardJson = JSON.stringify({
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
          unit: 'percent',
          min: 0,
          max: 100,
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
          expr: 'DCGM_FI_DEV_GPU_UTIL{Hostname=~"$node", gpu=~"$gpu"}',
          legendFormat: '{{Hostname}} GPU {{gpu}} ({{modelName}})',
          refId: 'A',
        },
      ],
      title: 'GPU utilization',
      type: 'timeseries',
    },
    {
      datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
      fieldConfig: {
        defaults: {
          unit: 'percent',
          min: 0,
          max: 100,
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
          expr: 'DCGM_FI_DEV_MEM_COPY_UTIL{Hostname=~"$node", gpu=~"$gpu"}',
          legendFormat: '{{Hostname}} GPU {{gpu}}',
          refId: 'A',
        },
      ],
      title: 'GPU memory copy utilization',
      type: 'timeseries',
    },
    {
      datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
      fieldConfig: {
        defaults: {
          unit: 'mbytes',
          min: 0,
        },
        overrides: [],
      },
      gridPos: { h: 8, w: 12, x: 0, y: 8 },
      id: 3,
      options: {
        legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
        tooltip: { mode: 'multi', sort: 'desc' },
      },
      targets: [
        {
          datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
          expr: 'DCGM_FI_DEV_FB_USED{Hostname=~"$node", gpu=~"$gpu"}',
          legendFormat: 'used {{Hostname}} GPU {{gpu}}',
          refId: 'A',
        },
        {
          datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
          expr: 'DCGM_FI_DEV_FB_FREE{Hostname=~"$node", gpu=~"$gpu"}',
          legendFormat: 'free {{Hostname}} GPU {{gpu}}',
          refId: 'B',
        },
      ],
      title: 'GPU framebuffer memory',
      type: 'timeseries',
    },
    {
      datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
      fieldConfig: {
        defaults: {
          unit: 'celsius',
          min: 0,
        },
        overrides: [],
      },
      gridPos: { h: 8, w: 6, x: 12, y: 8 },
      id: 4,
      options: {
        legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
        tooltip: { mode: 'multi', sort: 'desc' },
      },
      targets: [
        {
          datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
          expr: 'DCGM_FI_DEV_GPU_TEMP{Hostname=~"$node", gpu=~"$gpu"}',
          legendFormat: '{{Hostname}} GPU {{gpu}}',
          refId: 'A',
        },
      ],
      title: 'GPU temperature',
      type: 'timeseries',
    },
    {
      datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
      fieldConfig: {
        defaults: {
          unit: 'watt',
          min: 0,
        },
        overrides: [],
      },
      gridPos: { h: 8, w: 6, x: 18, y: 8 },
      id: 5,
      options: {
        legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
        tooltip: { mode: 'multi', sort: 'desc' },
      },
      targets: [
        {
          datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
          expr: 'DCGM_FI_DEV_POWER_USAGE{Hostname=~"$node", gpu=~"$gpu"}',
          legendFormat: '{{Hostname}} GPU {{gpu}}',
          refId: 'A',
        },
      ],
      title: 'GPU power usage',
      type: 'timeseries',
    },
    {
      datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
      fieldConfig: {
        defaults: {
          unit: 'hertz',
          min: 0,
        },
        overrides: [],
      },
      gridPos: { h: 8, w: 24, x: 0, y: 16 },
      id: 6,
      options: {
        legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
        tooltip: { mode: 'multi', sort: 'desc' },
      },
      targets: [
        {
          datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
          expr: 'DCGM_FI_DEV_SM_CLOCK{Hostname=~"$node", gpu=~"$gpu"} * 1000000',
          legendFormat: 'SM {{Hostname}} GPU {{gpu}}',
          refId: 'A',
        },
        {
          datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
          expr: 'DCGM_FI_DEV_MEM_CLOCK{Hostname=~"$node", gpu=~"$gpu"} * 1000000',
          legendFormat: 'MEM {{Hostname}} GPU {{gpu}}',
          refId: 'B',
        },
      ],
      title: 'GPU clocks',
      type: 'timeseries',
    },
  ],
  refresh: '30s',
  schemaVersion: 39,
  tags: ['gpu', 'nvidia', 'dcgm'],
  templating: {
    list: [
      {
        current: {},
        datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
        definition: 'label_values(DCGM_FI_DEV_GPU_UTIL, Hostname)',
        includeAll: true,
        allValue: '.*',
        label: 'node',
        multi: true,
        name: 'node',
        query: {
          query: 'label_values(DCGM_FI_DEV_GPU_UTIL, Hostname)',
          refId: 'StandardVariableQuery',
        },
        refresh: 2,
        regex: '',
        type: 'query',
      },
      {
        current: {},
        datasource: { type: 'prometheus', uid: 'VictoriaMetrics' },
        definition: 'label_values(DCGM_FI_DEV_GPU_UTIL{Hostname=~"$node"}, gpu)',
        includeAll: true,
        allValue: '.*',
        label: 'gpu',
        multi: true,
        name: 'gpu',
        query: {
          query: 'label_values(DCGM_FI_DEV_GPU_UTIL{Hostname=~"$node"}, gpu)',
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
  title: 'NVIDIA GPU (DCGM Exporter)',
  uid: 'nvidia-gpu-dcgm',
  version: 1,
});
