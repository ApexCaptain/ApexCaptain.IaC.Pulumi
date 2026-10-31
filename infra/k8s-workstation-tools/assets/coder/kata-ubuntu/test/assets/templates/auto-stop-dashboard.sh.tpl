#!/bin/bash
if ! command -v python3 >/dev/null 2>&1; then
  echo "상태 없음"
  exit 0
fi
python3 - <<'PY'
import json
import sys
import time

path = r"${state_file}"
mode = r"${mode}"

try:
    with open(path, "r") as handle:
        data = json.load(handle)
except Exception:
    sys.stdout.write("꺼짐\n")
    sys.exit(0)

if not isinstance(data, dict):
    sys.stdout.write("꺼짐\n")
    sys.exit(0)

decision = data.get("lastDecision") or ""

def fmt_secs(sec):
    sec = int(sec)
    if sec < 60:
        return "%d초" % sec
    minutes, seconds = divmod(sec, 60)
    if seconds:
        return "%d분 %d초" % (minutes, seconds)
    return "%d분" % minutes

if mode == "remaining":
    if decision == "skip":
        sys.stdout.write("건너뜀\n")
        sys.exit(0)
    if decision == "stop":
        sys.stdout.write("종료 중\n")
        sys.exit(0)
    wait = data.get("waitSeconds")
    epoch = data.get("lastActivityEpoch")
    try:
        wait_i = int(wait)
        epoch_i = int(epoch)
    except (TypeError, ValueError):
        sys.stdout.write("대기 중\n")
        sys.exit(0)
    remaining = wait_i - max(0, int(time.time()) - epoch_i)
    if remaining < 0:
        remaining = 0
    sys.stdout.write("%s / %s\n" % (fmt_secs(remaining), fmt_secs(wait_i)))
    sys.exit(0)

if mode == "activity":
    if decision == "skip":
        sys.stdout.write("감지 불가\n")
        sys.exit(0)
    parts = []
    if data.get("extensionHost") is True:
        parts.append("IDE")
    pts = data.get("pts")
    if isinstance(pts, list) and pts:
        names = ["pts/%s" % name for name in pts]
        parts.append("터미널 %s" % ", ".join(names))
    try:
        docker_i = int(data.get("dockerCount"))
    except (TypeError, ValueError):
        docker_i = 0
    if docker_i > 0:
        parts.append("Docker %d개" % docker_i)
    if parts:
        sys.stdout.write("%s\n" % " · ".join(parts))
    else:
        sys.stdout.write("없음\n")
    sys.exit(0)

sys.stdout.write("상태 없음\n")
PY
