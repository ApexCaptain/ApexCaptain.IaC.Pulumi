/**
 * OTel kubeletstats volume → VictoriaMetrics PVC 게스트 FS 대시보드.
 * Longhorn actualSize(TRIM 전 고수위)가 아님.
 * 비율 정의는 알림 `pvc-usage-high`와 같다.
 */
import { PVC_USAGE_ALERT_THRESHOLD } from '../alerting/pvc-usage-alerting';

const pvcSelector =
  'k8s_volume_type="persistentVolumeClaim", k8s_namespace_name=~"$namespace", k8s_persistentvolumeclaim_name=~"$pvc"';

const usedBytesExpr = `max by (k8s_namespace_name, k8s_persistentvolumeclaim_name) (k8s_volume_capacity_bytes{${pvcSelector}} - k8s_volume_available_bytes{${pvcSelector}})`;

const capacityBytesExpr = `max by (k8s_namespace_name, k8s_persistentvolumeclaim_name) (k8s_volume_capacity_bytes{${pvcSelector}})`;

const usageRatioExpr = `(${usedBytesExpr}) / clamp_min(${capacityBytesExpr}, 1)`;

const vm = { type: 'prometheus', uid: 'VictoriaMetrics' };
const legend = '{{k8s_namespace_name}}/{{k8s_persistentvolumeclaim_name}}';
const alertPct = Math.round(PVC_USAGE_ALERT_THRESHOLD * 100);

export const k8sPvcFilesystemDashboardJson = JSON.stringify({
  annotations: { list: [] },
  description:
    'Mounted PVC guest filesystem usage from kubeletstats. Not Longhorn actualSize.',
  editable: true,
  fiscalYearStartMonth: 0,
  graphTooltip: 1,
  id: null,
  links: [],
  panels: [
    {
      gridPos: { h: 3, w: 24, x: 0, y: 0 },
      id: 1,
      options: {
        content: [
          '게스트 FS 사용량 (`k8s_volume_*`, `df`와 같음).',
          `알림 \`pvc-usage-high\` 임계 **${alertPct}%**. Longhorn \`actualSize\`는 여기 없음.`,
          '마운트된 PVC만. 파드가 안 붙으면 시리즈 없음.',
        ].join(' '),
        mode: 'markdown',
      },
      title: '',
      transparent: true,
      type: 'text',
    },
    {
      datasource: vm,
      fieldConfig: {
        defaults: {
          custom: { align: 'auto', cellOptions: { type: 'auto' }, inspect: false },
          mappings: [],
          thresholds: {
            mode: 'absolute',
            steps: [
              { color: 'green', value: null },
              { color: 'orange', value: PVC_USAGE_ALERT_THRESHOLD },
              { color: 'red', value: 0.9 },
            ],
          },
        },
        overrides: [
          {
            matcher: { id: 'byName', options: 'Used' },
            properties: [{ id: 'unit', value: 'bytes' }],
          },
          {
            matcher: { id: 'byName', options: 'Capacity' },
            properties: [{ id: 'unit', value: 'bytes' }],
          },
          {
            matcher: { id: 'byName', options: 'Usage' },
            properties: [
              { id: 'unit', value: 'percentunit' },
              { id: 'min', value: 0 },
              { id: 'max', value: 1 },
              {
                id: 'custom.cellOptions',
                value: { mode: 'gradient', type: 'gauge' },
              },
            ],
          },
        ],
      },
      gridPos: { h: 10, w: 24, x: 0, y: 3 },
      id: 2,
      options: {
        cellHeight: 'sm',
        footer: { countRows: false, fields: '', reducer: ['sum'], show: false },
        showHeader: true,
        sortBy: [{ desc: true, displayName: 'Usage' }],
      },
      targets: [
        {
          datasource: vm,
          expr: usedBytesExpr,
          format: 'table',
          instant: true,
          refId: 'Used',
        },
        {
          datasource: vm,
          expr: capacityBytesExpr,
          format: 'table',
          instant: true,
          refId: 'Capacity',
        },
        {
          datasource: vm,
          expr: usageRatioExpr,
          format: 'table',
          instant: true,
          refId: 'Usage',
        },
      ],
      title: 'PVC filesystem now',
      transformations: [
        { id: 'merge', options: {} },
        {
          id: 'organize',
          options: {
            excludeByName: { Time: true },
            indexByName: {
              'k8s_namespace_name': 0,
              'k8s_persistentvolumeclaim_name': 1,
              'Value #Used': 2,
              'Value #Capacity': 3,
              'Value #Usage': 4,
            },
            renameByName: {
              'k8s_namespace_name': 'Namespace',
              'k8s_persistentvolumeclaim_name': 'PVC',
              'Value #Used': 'Used',
              'Value #Capacity': 'Capacity',
              'Value #Usage': 'Usage',
            },
          },
        },
      ],
      type: 'table',
    },
    {
      datasource: vm,
      fieldConfig: {
        defaults: {
          max: 1,
          min: 0,
          thresholds: {
            mode: 'absolute',
            steps: [
              { color: 'green', value: null },
              { color: 'orange', value: PVC_USAGE_ALERT_THRESHOLD },
              { color: 'red', value: 0.9 },
            ],
          },
          unit: 'percentunit',
        },
        overrides: [],
      },
      gridPos: { h: 8, w: 24, x: 0, y: 13 },
      id: 3,
      options: {
        legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
        tooltip: { mode: 'multi', sort: 'desc' },
      },
      targets: [
        {
          datasource: vm,
          expr: usageRatioExpr,
          legendFormat: legend,
          refId: 'A',
        },
      ],
      title: 'PVC filesystem usage ratio',
      type: 'timeseries',
    },
    {
      datasource: vm,
      fieldConfig: {
        defaults: {
          min: 0,
          unit: 'bytes',
        },
        overrides: [],
      },
      gridPos: { h: 8, w: 12, x: 0, y: 21 },
      id: 4,
      options: {
        legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
        tooltip: { mode: 'multi', sort: 'desc' },
      },
      targets: [
        {
          datasource: vm,
          expr: usedBytesExpr,
          legendFormat: legend,
          refId: 'A',
        },
      ],
      title: 'PVC filesystem used',
      type: 'timeseries',
    },
    {
      datasource: vm,
      fieldConfig: {
        defaults: {
          min: 0,
          unit: 'bytes',
        },
        overrides: [],
      },
      gridPos: { h: 8, w: 12, x: 12, y: 21 },
      id: 5,
      options: {
        legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
        tooltip: { mode: 'multi', sort: 'desc' },
      },
      targets: [
        {
          datasource: vm,
          expr: `max by (k8s_namespace_name, k8s_persistentvolumeclaim_name) (k8s_volume_available_bytes{${pvcSelector}})`,
          legendFormat: legend,
          refId: 'A',
        },
      ],
      title: 'PVC filesystem available',
      type: 'timeseries',
    },
  ],
  refresh: '30s',
  schemaVersion: 39,
  tags: ['k8s', 'kubeletstats', 'pvc', 'storage'],
  templating: {
    list: [
      {
        current: {},
        datasource: vm,
        definition:
          'label_values(k8s_volume_capacity_bytes{k8s_volume_type="persistentVolumeClaim"}, k8s_namespace_name)',
        includeAll: true,
        allValue: '.*',
        label: 'namespace',
        multi: true,
        name: 'namespace',
        query: {
          query:
            'label_values(k8s_volume_capacity_bytes{k8s_volume_type="persistentVolumeClaim"}, k8s_namespace_name)',
          refId: 'StandardVariableQuery',
        },
        refresh: 2,
        regex: '',
        type: 'query',
      },
      {
        current: {},
        datasource: vm,
        definition: 'label_values(k8s_volume_capacity_bytes{k8s_volume_type="persistentVolumeClaim", k8s_namespace_name=~"$namespace"}, k8s_persistentvolumeclaim_name)',
        includeAll: true,
        allValue: '.*',
        label: 'pvc',
        multi: true,
        name: 'pvc',
        query: {
          query: 'label_values(k8s_volume_capacity_bytes{k8s_volume_type="persistentVolumeClaim", k8s_namespace_name=~"$namespace"}, k8s_persistentvolumeclaim_name)',
          refId: 'StandardVariableQuery',
        },
        refresh: 2,
        regex: '',
        type: 'query',
      },
    ],
  },
  time: { from: 'now-6h', to: 'now' },
  timepicker: {},
  timezone: 'browser',
  title: 'K8s PVC Filesystem (kubeletstats)',
  uid: 'k8s-pvc-filesystem',
  version: 1,
});
