#!/bin/sh
# Readiness: prove torrent path works, not just WebUI TCP.
# Fails closed if BT is not on tun0 or VPN/DHT is dead.
set -eu

API="http://127.0.0.1:8080/api/v2"

# 1) WebUI API up
curl -sf --max-time 3 "${API}/app/version" >/dev/null

# 2) BT interface must be tun0 (regression guard for eth0-bind stall).
#    Conf Session\Interface alone is insufficient on qB 5.2 — trust API.
prefs="$(curl -sf --max-time 3 "${API}/app/preferences")"
echo "${prefs}" | grep -q '"current_network_interface":"tun0"'

# 3) gluetun health server (shared netns)
curl -sf --max-time 3 "http://127.0.0.1:9999/" >/dev/null

# 4) Real VPN egress via tun0 (health HTTP alone can lag after reconnect)
curl -sf --max-time 8 --interface tun0 "https://1.1.1.1/cdn-cgi/trace" \
  | grep -q '^ip='

# 5) BitTorrent session: not disconnected; DHT has peers (UDP P2P path alive).
#    NordVPN has no port-forward → connected OR firewalled are both OK.
transfer="$(curl -sf --max-time 3 "${API}/transfer/info")"
echo "${transfer}" | grep -Eq '"connection_status":"(connected|firewalled)"'
dht_nodes="$(echo "${transfer}" | sed -n 's/.*"dht_nodes":\([0-9][0-9]*\).*/\1/p')"
if [ -z "${dht_nodes}" ] || [ "${dht_nodes}" -le 0 ]; then
  echo "torrent-ready: dht_nodes=${dht_nodes:-empty} (want >0)" >&2
  exit 1
fi

exit 0
