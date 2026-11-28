#!/bin/sh
# After WebUI is up, force BT onto tun0 via API.
# Conf Session\Interface=* alone is not enough on qBittorrent 5.2 —
# it still listens on pod eth0 until setPreferences(current_network_interface).
set -eu

API="http://127.0.0.1:8080/api/v2"
i=0
while [ "${i}" -lt 60 ]; do
  if curl -sf --max-time 2 "${API}/app/version" >/dev/null 2>&1; then
    curl -sf --max-time 5 -X POST "${API}/app/setPreferences" \
      --data-urlencode 'json={"current_network_interface":"tun0","current_interface_address":""}'
    # Confirm
    prefs="$(curl -sf --max-time 3 "${API}/app/preferences")"
    echo "${prefs}" | grep -q '"current_network_interface":"tun0"'
    echo "[postStart] qBittorrent network interface set to tun0"
    exit 0
  fi
  i=$((i + 1))
  sleep 2
done

echo "[postStart] timed out waiting for qBittorrent WebUI API" >&2
exit 1
