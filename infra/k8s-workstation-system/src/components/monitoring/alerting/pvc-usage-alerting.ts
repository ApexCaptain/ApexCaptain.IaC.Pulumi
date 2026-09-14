import dedent from 'dedent';

/** Grafana provisioning 문자열 — TS 들여쓰기 제거 후 앞뒤 공백 trim. */
const grafanaTpl = (body: string): string => dedent(body).trim();

/**
 * PVC / 볼륨 사용량 Grafana Unified Alerting 프로비저닝.
 *
 * 비율 = (capacity - available) / capacity. PVC 마운트만.
 * 여러 시리즈는 alertname으로 묶어 Slack 한 통 (group_by: alertname).
 * 알림은 토요일 01:00–01:30 Asia/Seoul (active time interval)만.
 */
export const PVC_USAGE_ALERT_THRESHOLD = 0.7;
export const PVC_USAGE_ALERT_FOR = '10m';
/** 주 1회 윈도우. firing 중에도 주 1통이면 충분. */
export const PVC_USAGE_REPEAT_INTERVAL = '168h';
export const PVC_USAGE_EVAL_INTERVAL = '1m';

export const PVC_ACTIVE_TIME_INTERVAL_NAME = 'sat-0100-kst';

export const PVC_USAGE_RATIO_EXPR =
  '(k8s_volume_capacity_bytes{k8s_volume_type="persistentVolumeClaim"} - k8s_volume_available_bytes{k8s_volume_type="persistentVolumeClaim"}) / clamp_min(k8s_volume_capacity_bytes{k8s_volume_type="persistentVolumeClaim"}, 1)';

export const infraAlertsSlackContactPointName = 'infra-alerts-slack';
export const infraAlertsSlackReceiverUid = 'infra-alerts-slack';

/**
 * Grafana Slack: Block Kit 미지원 — mrkdwn·색·한국어 템플릿.
 * define 이름은 provisioning `name`과 동일 (Grafana 검증).
 */
const PVC_SLACK_TITLE_TEMPLATE = 'infra_pvc_slack_title';
const PVC_SLACK_TEXT_TEMPLATE = 'infra_pvc_slack_text';

export function buildPvcUsageNotificationTemplates() {
  const pct = Math.round(PVC_USAGE_ALERT_THRESHOLD * 100);
  return {
    apiVersion: 1,
    templates: [
      {
        orgId: 1,
        name: PVC_SLACK_TITLE_TEMPLATE,
        template: grafanaTpl(`
          {{ define "${PVC_SLACK_TITLE_TEMPLATE}" }}
          {{ if eq .Status "firing" }}
          [인프라] PVC 용량 ${pct}% 초과 ({{ len .Alerts.Firing }}건)
          {{ else }}
          [인프라] PVC 용량 경고 해제
          {{ end }}
          {{ end }}
        `),
      },
      {
        orgId: 1,
        name: PVC_SLACK_TEXT_TEMPLATE,
        template: grafanaTpl(`
          {{ define "${PVC_SLACK_TEXT_TEMPLATE}" }}
          {{ if eq .Status "firing" }}
          *PVC 용량 경고* (area=storage, 토 01:00-01:30 KST)
          {{ range .Alerts.Firing }}
          ---
          {{ .Annotations.summary }}
          {{ .Annotations.description }}
          {{ if .SilenceURL }}<{{ .SilenceURL }}|알림 끄기>{{ end }}
          {{ end }}
          _Grafana / PVC kubeletstats_
          {{ else }}
          *PVC 용량 정상 복구*
          {{ range .Alerts.Resolved }}
          - {{ .Annotations.summary }}
          {{ end }}
          {{ end }}
          {{ end }}
        `),
      },
    ],
  };
}

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
            // App Incoming Webhook: username/icon_emoji 오버라이드 불가
            settings: {
              url: slackWebhookUrl,
              color:
                '{{ if eq .Status "firing" }}#E01E5A{{ else }}#2EB67D{{ end }}',
              title: `{{ template "${PVC_SLACK_TITLE_TEMPLATE}" . }}`,
              text: `{{ template "${PVC_SLACK_TEXT_TEMPLATE}" . }}`,
            },
          },
        ],
      },
    ],
  };
}

/** 이름 있는 time interval. policy route의 active_time_intervals에 붙임. */
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
 * 루트 route에는 active_time_intervals를 못 붙임 (Alertmanager 규칙).
 * 자식 route가 storage 알림만 토요일 창에서 보낸다.
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
            title: `PVC 사용률 ${pct}% 이상`,
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
              // Grafana alert annotation 템플릿에 mul 없음. humanizePercentage(비율) → "75%".
              summary: grafanaTpl(`
                {{ \`{{ $labels.k8s_namespace_name }} / {{ $labels.k8s_persistentvolumeclaim_name }} — 사용률 {{ humanizePercentage $values.A.Value }}\` }}
              `),
              description: grafanaTpl(`
                {{ \`Pod {{ $labels.k8s_pod_name }} · 임계 ${pct}% · ${PVC_USAGE_ALERT_FOR} 이상 유지\` }}
              `),
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
