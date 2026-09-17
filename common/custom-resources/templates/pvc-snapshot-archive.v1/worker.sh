#!/usr/bin/env bash
# Lane A worker — clone mount → tar.zst → rclone Crypt copy
# Required env: TIMESTAMP, REMOTE_PREFIX,
#   PCLOUD_HOSTNAME_B64, PCLOUD_TOKEN_B64, CRYPT_PASSWORD_B64, CRYPT_PASSWORD2_B64
set -euo pipefail

: "${TIMESTAMP:?}"
: "${REMOTE_PREFIX:?}"
: "${PCLOUD_HOSTNAME_B64:?}"
: "${PCLOUD_TOKEN_B64:?}"
: "${CRYPT_PASSWORD_B64:?}"
: "${CRYPT_PASSWORD2_B64:?}"

PCLOUD_HOSTNAME="$(printf '%s' "${PCLOUD_HOSTNAME_B64}" | base64 -d)"
PCLOUD_TOKEN="$(printf '%s' "${PCLOUD_TOKEN_B64}" | base64 -d)"
CRYPT_PASSWORD="$(printf '%s' "${CRYPT_PASSWORD_B64}" | base64 -d)"
CRYPT_PASSWORD2="$(printf '%s' "${CRYPT_PASSWORD2_B64}" | base64 -d)"

DATA_DIR="${DATA_DIR:-/data}"
WORK_DIR="${WORK_DIR:-/work}"
ARCHIVE_NAME="backup.tar.zst"
RCLONE_CONF="${WORK_DIR}/rclone.conf"

mkdir -p "${WORK_DIR}"
ARCHIVE_PATH="${WORK_DIR}/${ARCHIVE_NAME}"

echo "[worker] packing ${DATA_DIR} → ${ARCHIVE_PATH}"
tar -C "${DATA_DIR}" -cf - . | zstd -T0 -19 -o "${ARCHIVE_PATH}"
ls -lh "${ARCHIVE_PATH}"

OBSCURED_PW="$(rclone obscure "${CRYPT_PASSWORD}")"
OBSCURED_PW2="$(rclone obscure "${CRYPT_PASSWORD2}")"

umask 077
cat >"${RCLONE_CONF}" <<EOF
[pcloud]
type = pcloud
hostname = ${PCLOUD_HOSTNAME}
token = ${PCLOUD_TOKEN}

[crypt]
type = crypt
remote = pcloud:${REMOTE_PREFIX}
password = ${OBSCURED_PW}
password2 = ${OBSCURED_PW2}
filename_encryption = standard
# PVC leaf까지 평문 path. timestamp 디렉터리도 웹에서 보이게 false.
directory_name_encryption = false
EOF

DEST="crypt:${TIMESTAMP}"
echo "[worker] rclone copy → pcloud:${REMOTE_PREFIX}/${TIMESTAMP}/"
rclone --config "${RCLONE_CONF}" copy "${ARCHIVE_PATH}" "${DEST}/" \
  --tpslimit 2 \
  --transfers 1 \
  --checkers 2 \
  --retries 5 \
  --low-level-retries 10

echo "[worker] done ${DEST}/${ARCHIVE_NAME}"
