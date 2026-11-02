#!/usr/bin/env bash
# ~/.config/rclone/mounts 목록을 ~/mnt/<이름> 실제 마운트에 맞춘다.
# 목록 한 줄: <이름> <remote:경로> [rclone mount 옵션...]   (# 주석, 빈 줄 무시)
#
#   rclone-mounts            목록대로 마운트·해제 (= sync)
#   rclone-mounts sync --auto  백그라운드 루프용. 실패한 항목은 5분 뒤 다시 시도
#   rclone-mounts status     정상 마운트 수 / 목록 수
#   rclone-mounts status -v  항목별 상태
#   rclone-mounts unmount    전부 해제
#   RCLONE_VERSION=x.y.z rclone-mounts install  rclone 공식 .deb 설치 (버전이 같으면 건너뜀)

set -uo pipefail

CONF_DIR="$HOME/.config/rclone"
LIST="$CONF_DIR/mounts"
RCLONE_CONF="$CONF_DIR/rclone.conf"
MNT_ROOT="$HOME/mnt"
# 적용한 줄을 마운트별로 기록. /tmp는 Pod마다 새로 만들어져 마운트와 수명이 같다
STATE_DIR="/tmp/rclone-mounts"
LOG_DIR="$HOME/.cache/rclone-mounts"

log() { echo "$(date '+%F %T') $*"; }

has_rclone() { command -v rclone >/dev/null 2>&1; }

# 루트 FS는 기동마다 이미지로 돌아가 매번 설치한다.
# curl --retry는 exit 92(HTTP/2 스트림 끊김) 같은 오류를 재시도하지 않아 --retry-all-errors를 쓰고,
# 잘린 파일을 apt에 넘기지 않도록 dpkg-deb로 아카이브를 확인한다
cmd_install() {
  local want="${RCLONE_VERSION:-}" deb url ok=""
  if [ -z "$want" ]; then
    log "설치 실패: RCLONE_VERSION 없음"
    return 1
  fi
  if [ "$(rclone version 2>/dev/null | head -n 1)" = "rclone v$want" ]; then
    return 0
  fi
  log "rclone v$want 설치 시작"
  deb="$(mktemp --suffix=.deb)"
  for url in \
    "https://downloads.rclone.org/v$want/rclone-v$want-linux-amd64.deb" \
    "https://github.com/rclone/rclone/releases/download/v$want/rclone-v$want-linux-amd64.deb"; do
    if curl -fsSL --connect-timeout 10 --retry 3 --retry-delay 2 --retry-all-errors -o "$deb" "$url" \
      && dpkg-deb --info "$deb" >/dev/null 2>&1; then
      ok=1
      break
    fi
    log "다운로드 실패: $url"
  done
  if [ -z "$ok" ]; then
    rm -f "$deb"
    log "설치 실패: rclone v$want .deb를 받지 못함"
    return 1
  fi
  sudo apt-get install -y -o DPkg::Lock::Timeout=300 "$deb"
  rm -f "$deb"
  if [ "$(rclone version 2>/dev/null | head -n 1)" != "rclone v$want" ]; then
    log "설치 실패: 설치 후 버전 불일치 ($(rclone version 2>/dev/null | head -n 1))"
    return 1
  fi
  log "rclone v$want 설치 완료"
}

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

  # 바이너리가 없으면 마운트를 시도하지 않는다. .failed 백오프는 remote 오류용이다
  if [ "${#WANT[@]}" -gt 0 ] && ! has_rclone; then
    log "rclone 없음: 마운트 건너뜀 (RCLONE_VERSION=<버전> rclone-mounts install)"
    return 1
  fi

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
  if ! has_rclone; then
    if [ "${1-}" = "-v" ]; then
      echo "❌ rclone 미설치 ($LOG_DIR/sync.log)"
    else
      echo "rclone 없음"
    fi
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
  install) cmd_install ;;
  *)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
