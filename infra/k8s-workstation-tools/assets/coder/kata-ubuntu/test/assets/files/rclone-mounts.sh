#!/usr/bin/env bash
# ~/.config/rclone/mounts 목록을 ~/mnt/<이름> 실제 마운트에 맞춘다.
# 목록 한 줄: <이름> <remote:경로> [rclone mount 옵션...]   (# 주석, 빈 줄 무시)
#
#   rclone-mounts            목록대로 마운트·해제 (= sync)
#   rclone-mounts sync --auto  백그라운드 루프용. 실패한 항목은 5분 뒤 다시 시도
#   rclone-mounts status     정상 마운트 수 / 목록 수
#   rclone-mounts status -v  항목별 상태
#   rclone-mounts unmount    전부 해제

set -uo pipefail

CONF_DIR="$HOME/.config/rclone"
LIST="$CONF_DIR/mounts"
RCLONE_CONF="$CONF_DIR/rclone.conf"
MNT_ROOT="$HOME/mnt"
# 적용한 줄을 마운트별로 기록. /tmp는 Pod마다 새로 만들어져 마운트와 수명이 같다
STATE_DIR="/tmp/rclone-mounts"
LOG_DIR="$HOME/.cache/rclone-mounts"

log() { echo "$(date '+%F %T') $*"; }

read_list() {
  [ -f "$LIST" ] || return 0
  grep -vE '^[[:space:]]*(#|$)' "$LIST"
}

# FUSE 경로를 stat하지 않는다 (remote가 멈추면 같이 멈춤)
is_mounted() { awk -v m="$1" '$5 == m { f = 1 } END { exit !f }' /proc/self/mountinfo; }
is_alive() { pgrep -f "rclone mount .* $1 " >/dev/null 2>&1; }

do_unmount() {
  local name="$1" target="$MNT_ROOT/$1"
  if is_mounted "$target"; then
    fusermount3 -uz "$target" 2>/dev/null || fusermount -uz "$target" 2>/dev/null || sudo umount -l "$target"
  fi
  pkill -f "rclone mount .* $target " 2>/dev/null
  rm -f "$STATE_DIR/$name"
  rmdir "$target" 2>/dev/null
  log "해제: $name"
}

do_mount() {
  local name="$1" line="$2" target="$MNT_ROOT/$1" remote opts
  read -r remote opts <<<"$line"
  mkdir -p "$target"
  # opts는 사용자가 적은 rclone 옵션이라 단어 분리한다. 9>&-: 데몬이 flock fd를 물고 있으면 다음 sync가 멈춘다
  # 표준 입출력은 로그로: 데몬이 호출자(coder_script) 파이프를 물면 "output pipes were not closed" 경고
  # shellcheck disable=SC2086
  if rclone mount "$remote" "$target" \
    --config "$RCLONE_CONF" \
    --allow-other \
    --vfs-cache-mode writes \
    --dir-cache-time 1m \
    --poll-interval 1m \
    --log-file "$LOG_DIR/$name.log" \
    --log-level INFO \
    --daemon \
    --daemon-wait 30s \
    $opts 9>&- </dev/null >>"$LOG_DIR/$name.log" 2>&1; then
    echo "$line" >"$STATE_DIR/$name"
    rm -f "$STATE_DIR/.failed/$name"
    log "마운트: $name ← $remote"
  else
    mkdir -p "$STATE_DIR/.failed"
    echo "$line" >"$STATE_DIR/.failed/$name"
    log "실패: $name ← $remote ($LOG_DIR/$name.log)"
    tail -n 3 "$LOG_DIR/$name.log" 2>/dev/null | sed 's/^/    /'
    rmdir "$target" 2>/dev/null
  fi
}

parse_list() {
  local name remote opts
  while read -r name remote opts; do
    if ! [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || [ -z "$remote" ]; then
      log "건너뜀: 잘못된 줄 '$name $remote $opts'" >&2
      continue
    fi
    WANT["$name"]="$(echo "$remote $opts" | sed 's/[[:space:]]*$//')"
  done < <(read_list)
}

cmd_sync() {
  mkdir -p "$MNT_ROOT" "$STATE_DIR" "$LOG_DIR"
  exec 9>"$STATE_DIR.lock"
  flock 9

  declare -gA WANT=()
  parse_list

  # 목록에서 빠졌거나 줄이 바뀐 마운트
  local st name
  for st in "$STATE_DIR"/*; do
    [ -e "$st" ] || continue
    name="$(basename "$st")"
    if [ "${WANT[$name]-}" != "$(cat "$st")" ]; then
      do_unmount "$name"
    fi
  done

  # 없거나 rclone이 죽은 마운트
  for name in "${!WANT[@]}"; do
    local target="$MNT_ROOT/$name"
    if is_mounted "$target" && is_alive "$target"; then
      continue
    fi
    local failed="$STATE_DIR/.failed/$name"
    if [ "${1-}" = "--auto" ] && [ -f "$failed" ] && [ "$(cat "$failed")" = "${WANT[$name]}" ] \
      && [ $(($(date +%s) - $(stat -c %Y "$failed"))) -lt 300 ]; then
      continue
    fi
    is_mounted "$target" && do_unmount "$name"
    do_mount "$name" "${WANT[$name]}"
  done
}

cmd_status() {
  declare -gA WANT=()
  parse_list 2>/dev/null
  local total=${#WANT[@]} ok=0 name target
  if [ "$total" -eq 0 ]; then
    echo "없음"
    return 0
  fi
  for name in "${!WANT[@]}"; do
    target="$MNT_ROOT/$name"
    if is_mounted "$target" && is_alive "$target"; then
      ok=$((ok + 1))
      [ "${1-}" = "-v" ] && echo "✅ $name  $target ← ${WANT[$name]}"
    else
      [ "${1-}" = "-v" ] && echo "❌ $name  $target ← ${WANT[$name]}  ($LOG_DIR/$name.log)"
    fi
  done
  [ "${1-}" = "-v" ] || echo "$ok/$total"
}

cmd_unmount_all() {
  mkdir -p "$STATE_DIR"
  exec 9>"$STATE_DIR.lock"
  flock 9
  local st
  for st in "$STATE_DIR"/*; do
    [ -e "$st" ] || continue
    do_unmount "$(basename "$st")"
  done
}

case "${1:-sync}" in
  sync) cmd_sync "${2-}" ;;
  status) cmd_status "${2-}" ;;
  unmount) cmd_unmount_all ;;
  *)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
