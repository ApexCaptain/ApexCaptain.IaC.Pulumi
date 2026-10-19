#!/usr/bin/env bash
# DR backup Slack — platform Secret `info-url` / `error-url`
# Required: PLATFORM_NS, SLACK_SECRET_NAME. jq + curl.
set -euo pipefail

slack_read_urls() {
  SLACK_INFO_URL=""
  SLACK_ERROR_URL=""
  if [[ -z "${PLATFORM_NS:-}" || -z "${SLACK_SECRET_NAME:-}" ]]; then
    return 0
  fi
  SLACK_INFO_URL="$(kubectl get secret -n "${PLATFORM_NS}" "${SLACK_SECRET_NAME}" \
    -o jsonpath='{.data.info-url}' 2>/dev/null | base64 -d)"
  SLACK_ERROR_URL="$(kubectl get secret -n "${PLATFORM_NS}" "${SLACK_SECRET_NAME}" \
    -o jsonpath='{.data.error-url}' 2>/dev/null | base64 -d)"
}

slack_post_payload() {
  local url="$1"
  local payload="$2"
  [[ -z "${url}" || -z "${payload}" ]] && return 0
  curl -sS -X POST -H 'Content-Type: application/json; charset=utf-8' \
    --data-binary "${payload}" \
    "${url}" >/dev/null 2>&1 || true
}

backup_slack_when() {
  TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S KST'
}

backup_slack_on_finish() {
  local code="$1"
  local label="${BACKUP_NOTIFY_LABEL:-${NS:-unknown}}"
  local dest="${REMOTE_PREFIX:-}"
  local ts="${TIMESTAMP:-}"
  local keep="${KEEP_WITHIN:-}"
  local when path_text
  when="$(backup_slack_when)"
  if [[ -n "${dest}" && -n "${ts}" ]]; then
    path_text="${dest}/${ts}/"
  elif [[ -n "${dest}" ]]; then
    path_text="${dest}/"
  else
    path_text="없음"
  fi

  slack_read_urls
  if [[ "${code}" -eq 0 ]]; then
    slack_post_payload "${SLACK_INFO_URL}" "$(jq -n \
      --arg header 'DR 백업 완료' \
      --arg label "${label}" \
      --arg path "${path_text}" \
      --arg keep "${keep:-—}" \
      --arg when "${when}" \
      '{
        text: ("[DR 백업] " + $label + " 완료"),
        blocks: [
          { type: "header", text: { type: "plain_text", text: $header, emoji: true } },
          { type: "divider" },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: ("*`" + $label + "`* 백업이 pCloud에 올라갔습니다.")
            }
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: ("*대상*\n`" + $label + "`") },
              { type: "mrkdwn", text: ("*경로*\n`" + $path + "`") },
              { type: "mrkdwn", text: ("*보관*\n`" + $keep + "`") },
              { type: "mrkdwn", text: ("*시각*\n" + $when) }
            ]
          },
          {
            type: "context",
            elements: [
              { type: "mrkdwn", text: "Lane A · pCloud Crypt · rclone" }
            ]
          }
        ]
      }')"
  else
    slack_post_payload "${SLACK_ERROR_URL}" "$(jq -n \
      --arg header 'DR 백업 실패' \
      --arg label "${label}" \
      --arg path "${path_text}" \
      --arg code "${code}" \
      --arg when "${when}" \
      '{
        text: ("[DR 백업] " + $label + " 실패 (종료 코드 " + $code + ")"),
        blocks: [
          { type: "header", text: { type: "plain_text", text: $header, emoji: true } },
          { type: "divider" },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: ("*`" + $label + "`* 백업 Job이 실패했습니다.\n해당 네임스페이스 Job 로그를 확인하세요.")
            }
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: ("*대상*\n`" + $label + "`") },
              { type: "mrkdwn", text: ("*종료 코드*\n`" + $code + "`") },
              { type: "mrkdwn", text: ("*경로*\n`" + $path + "`") },
              { type: "mrkdwn", text: ("*시각*\n" + $when) }
            ]
          },
          {
            type: "context",
            elements: [
              { type: "mrkdwn", text: "Lane A · pCloud Crypt · rclone" }
            ]
          }
        ]
      }')"
  fi
}
