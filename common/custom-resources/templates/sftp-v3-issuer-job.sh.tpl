set -eu
export VAULT_ADDR=__VAULT_ADDR_JSON__
export VAULT_CACERT=/vault/ca/ca.crt
apk add --no-cache jq curl coreutils openssh-keygen >/dev/null
VAULT_TOKEN="$(vault write -field=token "auth/__K8S_MOUNT__/login" \
  role="__K8S_ROLE__" \
  jwt="$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)")"
export VAULT_TOKEN
USER_KV="__KV_MOUNT__/__USER_KV_PATH__"
HOST_KV="__KV_MOUNT__/__HOST_KV_PATH__"
SLACK_URL="$(cat /slack/url)"
kv_blank() { [ -z "$1" ] || [ "$1" = "null" ]; }
pub_from_priv() {
  umask 077
  tmp="$(mktemp)"
  printf '%s\n' "$1" > "$tmp"
  ssh-keygen -y -f "$tmp"
  rm -f "$tmp"
}
slack_post_payload() {
  curl -sS -X POST -H 'Content-Type: application/json; charset=utf-8' \
    --data-binary "$1" \
    "$SLACK_URL" >/dev/null 2>&1 || true
}
slack_notify_key_rotated() {
  local when
  when="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  slack_post_payload "$(jq -n \
    --arg header '유저 SSH 키 교체' \
    --arg ns '__NAMESPACE__' \
    --arg adapter '__ADAPTER__' \
    --arg username '__USERNAME__' \
    --arg vault_path '__KV_MOUNT__/data/__USER_KV_PATH__' \
    --arg when "$when" \
    '{
      text: ("[sftp-v3] " + $adapter + " 유저 SSH 키(Ed25519) 교체"),
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: $header, emoji: true }
        },
        { type: "divider" },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: (
              "*`" + $adapter + "`* 어댑터에서 유저 SSH 키(Ed25519)가 교체되었습니다.\n"
              + "RaiDrive에 새 개인키를 넣으세요. 옛 키는 7일 후 차단됩니다."
            )
          }
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: ("*네임스페이스*\n`" + $ns + "`") },
            { type: "mrkdwn", text: ("*어댑터*\n`" + $adapter + "`") },
            { type: "mrkdwn", text: ("*유저*\n`" + $username + "`") },
            { type: "mrkdwn", text: ("*Vault 경로*\n`" + $vault_path + "`") },
            { type: "mrkdwn", text: ("*알림 시각*\n" + $when) }
          ]
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "sftp-v3 · key rotate · Vault KV `current_private`"
            }
          ]
        }
      ]
    }')"
}
slack_notify_key_expiry_warning() {
  local expires="$1"
  local when
  when="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  slack_post_payload "$(jq -n \
    --arg header '옛 SSH 키 만료 임박' \
    --arg ns '__NAMESPACE__' \
    --arg adapter '__ADAPTER__' \
    --arg username '__USERNAME__' \
    --arg vault_path '__KV_MOUNT__/data/__USER_KV_PATH__' \
    --arg expires "$expires" \
    --arg when "$when" \
    '{
      text: ("[sftp-v3] " + $adapter + " 옛 유저 SSH 키 내일 차단"),
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: $header, emoji: true }
        },
        { type: "divider" },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: (
              "*`" + $adapter + "`* 어댑터에서 옛 유저 SSH 키가 곧 차단됩니다.\n"
              + "Vault에서 `current_private`를 받아 RaiDrive를 갱신하세요."
            )
          }
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: ("*네임스페이스*\n`" + $ns + "`") },
            { type: "mrkdwn", text: ("*어댑터*\n`" + $adapter + "`") },
            { type: "mrkdwn", text: ("*유저*\n`" + $username + "`") },
            { type: "mrkdwn", text: ("*옛 키 만료(UTC)*\n`" + $expires + "`") },
            { type: "mrkdwn", text: ("*Vault 경로*\n`" + $vault_path + "`") },
            { type: "mrkdwn", text: ("*알림 시각*\n" + $when) }
          ]
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "sftp-v3 · reconcile D-1 · overlap 종료 전 리마인드"
            }
          ]
        }
      ]
    }')"
}
issue_user() {
  vault write -format=json "__USER_CA_MOUNT__/issue/__USER_ROLE__" \
    valid_principals="__USERNAME__" \
    key_type=ed25519 \
    ttl="__USER_ISSUE_TTL__"
}
put_user() {
  vault kv put "$USER_KV" \
    current_private="$1" \
    current_public="$2" \
    previous_private="$3" \
    previous_public="$4" \
    previous_expires_at="$5" \
    slack_d1_sent="$6" \
    authorized_keys="$7"
}
case "$SFTP_JOB_MODE" in
  bootstrap)
    HOST_ISSUE="$(vault write -format=json "__HOST_CA_MOUNT__/issue/__HOST_ROLE__" \
      cert_type=host \
      key_type=ed25519 \
      valid_principals="__HOST_PRINCIPALS__" \
      ttl="__HOST_ISSUE_TTL__")"
    HOST_PRIV="$(echo "$HOST_ISSUE" | jq -r .data.private_key)"
    vault kv put "$HOST_KV" \
      private_key="$HOST_PRIV" \
      public_key="$(pub_from_priv "$HOST_PRIV")"
    USER_ISSUE="$(issue_user)"
    CUR_PRIV="$(echo "$USER_ISSUE" | jq -r .data.private_key)"
    CUR_PUB="$(pub_from_priv "$CUR_PRIV")"
    put_user "$CUR_PRIV" "$CUR_PUB" "" "" "" "true" "$CUR_PUB"
    ;;
  rotate)
    OLD="$(vault kv get -format=json "$USER_KV")"
    OLD_PRIV="$(echo "$OLD" | jq -r '.data.data.current_private // empty')"
    OLD_PUB="$(echo "$OLD" | jq -r '.data.data.current_public // empty')"
    kv_blank "$OLD_PUB" && ! kv_blank "$OLD_PRIV" && OLD_PUB="$(pub_from_priv "$OLD_PRIV")"
    USER_ISSUE="$(issue_user)"
    CUR_PRIV="$(echo "$USER_ISSUE" | jq -r .data.private_key)"
    CUR_PUB="$(pub_from_priv "$CUR_PRIV")"
    EXPIRES="$(date -u -d '+__USER_KEY_OVERLAP__' +%Y-%m-%dT%H:%M:%SZ)"
    AUTH="$CUR_PUB"
    if ! kv_blank "$OLD_PUB"; then
      AUTH="$(printf '%s\n%s\n' "$CUR_PUB" "$OLD_PUB")"
    fi
    kv_blank "$OLD_PRIV" && OLD_PRIV=""
    kv_blank "$OLD_PUB" && OLD_PUB=""
    put_user "$CUR_PRIV" "$CUR_PUB" "$OLD_PRIV" "$OLD_PUB" "$EXPIRES" "false" "$AUTH"
    slack_notify_key_rotated
    ;;
  reconcile)
    DATA="$(vault kv get -format=json "$USER_KV")"
    EXP="$(echo "$DATA" | jq -r '.data.data.previous_expires_at // empty')"
    SENT="$(echo "$DATA" | jq -r '.data.data.slack_d1_sent // empty')"
    CUR_PRIV="$(echo "$DATA" | jq -r '.data.data.current_private // empty')"
    CUR_PUB="$(echo "$DATA" | jq -r '.data.data.current_public // empty')"
    PREV_PRIV="$(echo "$DATA" | jq -r '.data.data.previous_private // empty')"
    PREV_PUB="$(echo "$DATA" | jq -r '.data.data.previous_public // empty')"
    kv_blank "$SENT" && SENT="true"
    kv_blank "$EXP" && EXP=""
    kv_blank "$PREV_PRIV" && PREV_PRIV=""
    kv_blank "$PREV_PUB" && PREV_PUB=""
    if kv_blank "$CUR_PUB" && ! kv_blank "$CUR_PRIV"; then
      CUR_PUB="$(pub_from_priv "$CUR_PRIV")"
      AUTH="$CUR_PUB"
      if [ -n "$PREV_PUB" ]; then
        AUTH="$(printf '%s\n%s\n' "$CUR_PUB" "$PREV_PUB")"
      fi
      put_user "$CUR_PRIV" "$CUR_PUB" "$PREV_PRIV" "$PREV_PUB" "$EXP" "$SENT" "$AUTH"
    fi
    kv_blank "$EXP" && exit 0
    NOW_EPOCH="$(date -u +%s)"
    EXP_EPOCH="$(date -u -d "$EXP" +%s)"
    if [ "$NOW_EPOCH" -ge "$EXP_EPOCH" ]; then
      put_user "$CUR_PRIV" "$CUR_PUB" "" "" "" "true" "$CUR_PUB"
      exit 0
    fi
    REMAIN="$((EXP_EPOCH - NOW_EPOCH))"
    if [ "$REMAIN" -le 86400 ] && [ "$SENT" != "true" ]; then
      AUTH="$(printf '%s\n%s\n' "$CUR_PUB" "$PREV_PUB")"
      put_user "$CUR_PRIV" "$CUR_PUB" "$PREV_PRIV" "$PREV_PUB" "$EXP" "true" "$AUTH"
      slack_notify_key_expiry_warning "$EXP"
    fi
    ;;
  *)
    echo "unknown SFTP_JOB_MODE=$SFTP_JOB_MODE" >&2
    exit 1
    ;;
esac
