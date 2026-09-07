/**
 * Grafana Unified Alerting provisioning for PVC / volume usage.
 *
 * Ratio = (capacity - available) / capacity for PVC mounts only.
 * Multi-series instances group under one Slack message (group_by: alertname).
 * Notifications only during Saturday 01:00–01:30 Asia/Seoul (active time interval).
 */
export const PVC_USAGE_ALERT_THRESHOLD = 0.7;
export const PVC_USAGE_ALERT_FOR = '10m';
/** Weekly window — one notify per week is enough while firing. */
export const PVC_USAGE_REPEAT_INTERVAL = '168h';
export const PVC_USAGE_EVAL_INTERVAL = '1m';

export const PVC_ACTIVE_TIME_INTERVAL_NAME = 'sat-0100-kst';

export const PVC_USAGE_RATIO_EXPR =
  '(k8s_volume_capacity_bytes{k8s_volume_type="persistentVolumeClaim"} - k8s_volume_available_bytes{k8s_volume_type="persistentVolumeClaim"}) / clamp_min(k8s_volume_capacity_bytes{k8s_volume_type="persistentVolumeClaim"}, 1)';

export const infraAlertsSlackContactPointName = 'infra-alerts-slack';
export const infraAlertsSlackReceiverUid = 'infra-alerts-slack';

export function buildPvcUsageContactPoints(slackWebhookUrl: string) {
  return {
    apiVersion: 1,
    contactPoints: [
      {
        orgId: 1,
        name: infraAlertsSlackContactPointName,
        receivers: [
          {
            uid: infraAlertsSlackReceiverUid,
            type: 'slack',
            disableResolveMessage: false,
            settings: {
              url: slackWebhookUrl,
              username: 'grafana-infra-alerts',
              title:
                '{{ `{{ template "slack.default.title" . }}` }}',
              text: '{{ `{{ template "slack.default.text" . }}` }}',
            },
          },
        ],
      },
    ],
  };
}

/** Named time interval — applied as active_time_intervals on the policy route. */
export function buildPvcUsageMuteTimes() {
  return {
    apiVersion: 1,
    muteTimes: [
      {
        orgId: 1,
        name: PVC_ACTIVE_TIME_INTERVAL_NAME,
        time_intervals: [
          {
            times: [{ start_time: '01:00', end_time: '01:30' }],
            weekdays: ['saturday'],
            location: 'Asia/Seoul',
          },
        ],
      },
    ],
  };
}

/**
 * Root cannot carry active_time_intervals (Alertmanager rule).
 * Child route matches storage alerts and only notifies in the Sat window.
 */
export function buildPvcUsageNotificationPolicies() {
  return {
    apiVersion: 1,
    policies: [
      {
        orgId: 1,
        receiver: infraAlertsSlackContactPointName,
        group_by: ['alertname'],
        routes: [
          {
            receiver: infraAlertsSlackContactPointName,
            object_matchers: [['area', '=', 'storage']],
            group_by: ['alertname'],
            group_wait: '30s',
            group_interval: '5m',
            repeat_interval: PVC_USAGE_REPEAT_INTERVAL,
            active_time_intervals: [PVC_ACTIVE_TIME_INTERVAL_NAME],
          },
        ],
      },
    ],
  };
}

export function buildPvcUsageAlertRules() {
  const pct = Math.round(PVC_USAGE_ALERT_THRESHOLD * 100);
  return {
    apiVersion: 1,
    groups: [
      {
        orgId: 1,
        name: 'pvc-usage',
        folder: 'Infrastructure',
        interval: PVC_USAGE_EVAL_INTERVAL,
        rules: [
          {
            uid: 'pvc-usage-high',
            title: `PVC usage >= ${pct}%`,
            condition: 'B',
            data: [
              {
                refId: 'A',
                relativeTimeRange: { from: 600, to: 0 },
                datasourceUid: 'VictoriaMetrics',
                model: {
                  datasource: {
                    type: 'prometheus',
                    uid: 'VictoriaMetrics',
                  },
                  editorMode: 'code',
                  expr: PVC_USAGE_RATIO_EXPR,
                  instant: true,
                  intervalMs: 1000,
                  maxDataPoints: 43200,
                  refId: 'A',
                },
              },
              {
                refId: 'B',
                relativeTimeRange: { from: 0, to: 0 },
                datasourceUid: '__expr__',
                model: {
                  conditions: [
                    {
                      evaluator: {
                        params: [PVC_USAGE_ALERT_THRESHOLD],
                        type: 'gt',
                      },
                      operator: { type: 'and' },
                      query: { params: ['B'] },
                      reducer: { params: [], type: 'last' },
                      type: 'query',
                    },
                  ],
                  datasource: {
                    type: '__expr__',
                    uid: '__expr__',
                  },
                  expression: 'A',
                  intervalMs: 1000,
                  maxDataPoints: 43200,
                  refId: 'B',
                  type: 'threshold',
                },
              },
            ],
            noDataState: 'OK',
            execErrState: 'Error',
            for: PVC_USAGE_ALERT_FOR,
            annotations: {
              summary: `PVC usage is at or above ${pct}% of capacity for ${PVC_USAGE_ALERT_FOR}.`,
              description:
                'pvc={{ `{{ $labels.k8s_persistentvolumeclaim_name }}` }} ns={{ `{{ $labels.k8s_namespace_name }}` }} pod={{ `{{ $labels.k8s_pod_name }}` }} value={{ `{{ $values.A }}` }}',
            },
            labels: {
              severity: 'warning',
              area: 'storage',
            },
            isPaused: false,
          },
        ],
      },
    ],
  };
}
