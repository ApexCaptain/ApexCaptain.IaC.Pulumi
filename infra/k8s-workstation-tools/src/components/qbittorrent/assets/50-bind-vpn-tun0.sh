#!/bin/bash
# Force BitTorrent onto WireGuard (tun0).
#
# gluetun installs: `from <pod-eth0-ip> lookup 200` with default via eth0 so
# inbound WebUI/SFTP replies stay on eth0. qBittorrent that binds the pod IP
# then hits the killswitch (OUTPUT DROP) for internet peers/trackers/DHT.
# Binding BT to tun0 keeps swarm traffic on the VPN path. See gluetun#1813 /
# discussion #3272.
set -euo pipefail

CONF_DIR="/config/qBittorrent"
CONF="${CONF_DIR}/qBittorrent.conf"
mkdir -p "${CONF_DIR}"
touch "${CONF}"

# Drop prior Interface* keys (idempotent across restarts / UI edits)
sed -i \
  -e '/^Session\\Interface=/d' \
  -e '/^Session\\InterfaceName=/d' \
  -e '/^Session\\InterfaceAddress=/d' \
  "${CONF}"

{
  echo 'Session\Interface=tun0'
  echo 'Session\InterfaceName=tun0'
} >>"${CONF}"

echo "[cont-init] qBittorrent BitTorrent interface forced to tun0"
