#!/bin/bash

state_dir_path='${state_dir_path}'
log_dir_path="$${HOME}/${log_subdir}"
script_filename='${script_filename}'

mkdir -p "$state_dir_path" "$log_dir_path"

uptime_secs=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)
start_epoch=$(($(date +%s) - uptime_secs))
stamp=$(date -d "@$start_epoch" +%Y-%m-%dT%H-%M-%S 2>/dev/null || date +%Y-%m-%dT%H-%M-%S)
session_log="$log_dir_path/$stamp.log"

log_skip() {
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [건너뜀] $1" >> "$session_log"
}

nvm_sh=""
for dir in "$${HOME}/.nvm/nvm" "$${HOME}/.nvm"; do
    if [ -s "$dir/nvm.sh" ]; then
        export NVM_DIR="$dir"
        nvm_sh="$dir/nvm.sh"
        break
    fi
done

if [ -z "$nvm_sh" ]; then
    log_skip "nvm.sh not found, skip"
    exit 0
fi

set +e
. "$nvm_sh" >/dev/null 2>&1
set -e

if ! command -v node >/dev/null 2>&1; then
    log_skip "node not on PATH after nvm, skip"
    exit 0
fi

base64 -d > "$state_dir_path/lib.js" <<'LIB_B64'
${lib_b64}
LIB_B64

base64 -d > "$state_dir_path/$script_filename" <<'SCRIPT_B64'
${script_b64}
SCRIPT_B64

export WAIT_SECONDS='${wait_seconds}'
export LOG_DIR="$log_dir_path"
export STATE_DIR="$state_dir_path"

cd "$state_dir_path"
node "./$script_filename"
