#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ISTIO_CNI_REBOOT_REPAIR_SOURCED=1
# shellcheck disable=SC1091
. "$SCRIPT_DIR/istio-cni-reboot-repair.sh"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

if should_restart "boot-a" "boot-a"; then
  fail "same boot id should return 1"
fi

if should_restart "boot-b" "boot-a"; then
  :
else
  fail "different boot id should return 0"
fi

if should_restart "boot-c" ""; then
  :
else
  fail "empty recorded boot id should return 0"
fi

echo "ok"
