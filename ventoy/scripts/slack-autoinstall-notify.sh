#!/usr/bin/env bash
# Ventoy Ubuntu autoinstall 첫 부팅 Slack 알림 (Incoming Webhook)
set -uo pipefail

if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
  echo 'slack-autoinstall-notify: SLACK_WEBHOOK_URL is unset' >&2
  exit 0
fi

hostname_short="$(hostname -s 2>/dev/null || hostname)"
fqdn="$(hostname -f 2>/dev/null || echo "$hostname_short")"
primary_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
all_ips="$(hostname -I 2>/dev/null | xargs 2>/dev/null | tr ' ' ', ')"
completed_at="$(date '+%Y-%m-%d %H:%M:%S %Z')"

export VENTOY_NOTIFY_HOST="$hostname_short"
export VENTOY_NOTIFY_FQDN="$fqdn"
export VENTOY_NOTIFY_IP="${primary_ip:-알 수 없음}"
export VENTOY_NOTIFY_ALL_IPS="${all_ips:-}"
export VENTOY_NOTIFY_AT="$completed_at"

payload="$(
  python3 - <<'PY'
import json
import os

host = os.environ["VENTOY_NOTIFY_HOST"]
fqdn = os.environ["VENTOY_NOTIFY_FQDN"]
ip = os.environ["VENTOY_NOTIFY_IP"]
all_ips = os.environ.get("VENTOY_NOTIFY_ALL_IPS", "")
when = os.environ["VENTOY_NOTIFY_AT"]

fields = [
    {"type": "mrkdwn", "text": f"*호스트명*\n`{host}`"},
    {"type": "mrkdwn", "text": f"*FQDN*\n`{fqdn}`"},
    {"type": "mrkdwn", "text": f"*주 IP*\n`{ip}`"},
    {"type": "mrkdwn", "text": f"*완료 시각*\n{when}"},
]
if all_ips and all_ips.replace(",", "").strip() and all_ips != ip:
    fields.append({"type": "mrkdwn", "text": f"*전체 IP*\n`{all_ips}`"})

# App Incoming Webhook: username/icon_emoji 오버라이드 불가 (앱 설정만 적용)
payload = {
    "text": f"[Ventoy] {host} 자동 설치 완료 (IP: {ip})",
    "blocks": [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "Ubuntu Autoinstall 완료",
                "emoji": True,
            },
        },
        {"type": "divider"},
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f"*{host}* 노드에서 Ventoy 기반 자동 설치가 완료되었고 "
                    "첫 부팅이 끝났습니다.\n"
                    "SSH 접속·추가 구성을 진행할 수 있습니다."
                ),
            },
        },
        {"type": "section", "fields": fields[:10]},
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": "cloud-init `runcmd` · Ventoy autoinstall",
                }
            ],
        },
    ],
}

print(json.dumps(payload, ensure_ascii=False))
PY
)" || exit 0

curl -sS -X POST "$SLACK_WEBHOOK_URL" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary "$payload" \
  >/dev/null 2>&1 || true
