#!/usr/bin/env bash
# Lane A — vault operator raft snapshot → rclone Crypt
# Env set by CronJob (VaultRaftArchiveV1Component).
# PVC/file copy 금지. local-path CSI snap 아님.
set -euo pipefail

: "${NS:?}"
: "${LEAF_NAME:?}"
: "${CRED_SECRET:?}"
: "${LANE:?}"
: "${KEEP_WITHIN:?}"
: "${PLATFORM_NS:?}"
: "${LEASE_NAME:?}"
: "${PLATFORM_CONFIG_CM:?}"
: "${RESOURCE_PREFIX:?}"
: "${VAULT_ADDR:?}"
: "${VAULT_CACERT:?}"
: "${VAULT_K8S_AUTH_MOUNT:?}"
: "${VAULT_K8S_AUTH_ROLE:?}"
: "${VAULT_VERSION:?}"

CLUSTER="${CLUSTER:-}"
LEASE_WAIT_SEC="${LEASE_WAIT_SEC:-600}"
SNAPSHOT_NAME="vault-raft.snap"
WORK_DIR="${WORK_DIR:-/work}"

TIMESTAMP="$(TZ=Asia/Seoul date +%Y-%m-%d_%H%M%S)"
HOLDER=""
REMOTE_PREFIX=""
RUN_TOKEN=""

cleanup() {
  local code=$?
  set +e
  echo "[orch] cleanup (exit=${code})"
  release_lease || true
  exit "${code}"
}
trap cleanup EXIT

log() { echo "[orch] $*"; }

resolve_cluster_name() {
  if [[ -n "${CLUSTER}" ]]; then
    log "clusterName override=${CLUSTER}"
    return 0
  fi
  CLUSTER="$(kubectl get configmap -n "${PLATFORM_NS}" "${PLATFORM_CONFIG_CM}" -o jsonpath='{.data.clusterName}')"
  if [[ -z "${CLUSTER}" ]]; then
    echo "failed to read clusterName from ${PLATFORM_NS}/${PLATFORM_CONFIG_CM}" >&2
    return 1
  fi
  log "clusterName from platform=${CLUSTER}"
}

read_platform_creds() {
  CRED_HOSTNAME="$(kubectl get secret -n "${PLATFORM_NS}" "${CRED_SECRET}" -o jsonpath='{.data.hostname}' | base64 -d)"
  CRED_TOKEN="$(kubectl get secret -n "${PLATFORM_NS}" "${CRED_SECRET}" -o jsonpath='{.data.token}' | base64 -d)"
  CRED_PW="$(kubectl get secret -n "${PLATFORM_NS}" "${CRED_SECRET}" -o jsonpath='{.data.crypt-password}' | base64 -d)"
  CRED_PW2="$(kubectl get secret -n "${PLATFORM_NS}" "${CRED_SECRET}" -o jsonpath='{.data.crypt-password2}' | base64 -d)"
  if [[ -z "${CRED_HOSTNAME}" || -z "${CRED_TOKEN}" || -z "${CRED_PW}" ]]; then
    echo "failed to read credentials from ${PLATFORM_NS}/${CRED_SECRET}" >&2
    return 1
  fi
}

init_run_ids() {
  REMOTE_PREFIX="k8s-backup/${CLUSTER}/${LANE}/${NS}/${LEAF_NAME}"
  RUN_TOKEN="$(printf '%s' "${LEAF_NAME}|${TIMESTAMP}|$$" | sha256sum | awk '{print substr($1,1,12)}')"
  HOLDER="${RESOURCE_PREFIX}-${RUN_TOKEN}-$$"
  log "runToken=${RUN_TOKEN} remote=${REMOTE_PREFIX}"
}

parse_keep_within_seconds() {
  local raw="$1"
  if [[ "${raw}" =~ ^([0-9]+)d$ ]]; then
    echo $((BASH_REMATCH[1] * 86400))
    return
  fi
  if [[ "${raw}" =~ ^([0-9]+)h$ ]]; then
    echo $((BASH_REMATCH[1] * 3600))
    return
  fi
  echo "unsupported KEEP_WITHIN=${raw} (use Nd or Nh)" >&2
  return 1
}

acquire_lease() {
  local deadline=$((SECONDS + LEASE_WAIT_SEC))
  local duration
  duration="$(kubectl get lease -n "${PLATFORM_NS}" "${LEASE_NAME}" -o jsonpath='{.spec.leaseDurationSeconds}')"
  duration="${duration:-600}"

  while (( SECONDS < deadline )); do
    local now holder renew_epoch now_epoch rv
    now="$(date -u +%Y-%m-%dT%H:%M:%S.000000Z)"
    rv="$(kubectl get lease -n "${PLATFORM_NS}" "${LEASE_NAME}" -o jsonpath='{.metadata.resourceVersion}')"
    holder="$(kubectl get lease -n "${PLATFORM_NS}" "${LEASE_NAME}" -o jsonpath='{.spec.holderIdentity}' 2>/dev/null || true)"
    local renew
    renew="$(kubectl get lease -n "${PLATFORM_NS}" "${LEASE_NAME}" -o jsonpath='{.spec.renewTime}' 2>/dev/null || true)"

    now_epoch="$(date -u +%s)"
    renew_epoch=0
    if [[ -n "${renew}" ]]; then
      renew_epoch="$(date -u -d "${renew}" +%s 2>/dev/null || echo 0)"
    fi

    if [[ -z "${holder}" ]] || (( now_epoch - renew_epoch > duration )); then
      if kubectl patch lease -n "${PLATFORM_NS}" "${LEASE_NAME}" --type json -p \
        "[{\"op\":\"test\",\"path\":\"/metadata/resourceVersion\",\"value\":\"${rv}\"},{\"op\":\"replace\",\"path\":\"/spec\",\"value\":{\"holderIdentity\":\"${HOLDER}\",\"leaseDurationSeconds\":${duration},\"acquireTime\":\"${now}\",\"renewTime\":\"${now}\"}}]" \
        >/dev/null 2>&1; then
        sleep 1
        holder="$(kubectl get lease -n "${PLATFORM_NS}" "${LEASE_NAME}" -o jsonpath='{.spec.holderIdentity}')"
        if [[ "${holder}" == "${HOLDER}" ]]; then
          log "lease acquired holder=${HOLDER}"
          return 0
        fi
      else
        log "lease patch failed (rv=${rv}); retry..."
      fi
    else
      log "lease held by ${holder}; waiting..."
    fi
    sleep 5
  done
  echo "failed to acquire lease ${PLATFORM_NS}/${LEASE_NAME}" >&2
  return 1
}

release_lease() {
  local holder rv
  holder="$(kubectl get lease -n "${PLATFORM_NS}" "${LEASE_NAME}" -o jsonpath='{.spec.holderIdentity}' 2>/dev/null || true)"
  if [[ "${holder}" != "${HOLDER}" ]]; then
    return 0
  fi
  rv="$(kubectl get lease -n "${PLATFORM_NS}" "${LEASE_NAME}" -o jsonpath='{.metadata.resourceVersion}' 2>/dev/null || true)"
  if [[ -n "${rv}" ]]; then
    kubectl patch lease -n "${PLATFORM_NS}" "${LEASE_NAME}" --type json -p \
      "[{\"op\":\"test\",\"path\":\"/metadata/resourceVersion\",\"value\":\"${rv}\"},{\"op\":\"replace\",\"path\":\"/spec/holderIdentity\",\"value\":\"\"}]" \
      >/dev/null 2>&1 || true
  else
    kubectl patch lease -n "${PLATFORM_NS}" "${LEASE_NAME}" --type merge -p \
      '{"spec":{"holderIdentity":""}}' >/dev/null 2>&1 || true
  fi
  log "lease released"
}

install_vault_cli() {
  if command -v vault >/dev/null 2>&1; then
    log "vault cli present $(vault version | head -1)"
    return 0
  fi
  local zip="/tmp/vault.zip"
  local url="https://releases.hashicorp.com/vault/${VAULT_VERSION}/vault_${VAULT_VERSION}_linux_amd64.zip"
  log "download vault ${VAULT_VERSION}"
  curl -fsSL "${url}" -o "${zip}"
  unzip -o -q "${zip}" -d /usr/local/bin
  chmod +x /usr/local/bin/vault
  vault version | head -1
}

vault_k8s_login() {
  local jwt token
  jwt="$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)"
  if [[ -z "${jwt}" ]]; then
    echo "empty serviceaccount token" >&2
    return 1
  fi
  log "vault login auth/${VAULT_K8S_AUTH_MOUNT} role=${VAULT_K8S_AUTH_ROLE}"
  token="$(vault write -field=token "auth/${VAULT_K8S_AUTH_MOUNT}/login" \
    role="${VAULT_K8S_AUTH_ROLE}" \
    jwt="${jwt}")"
  if [[ -z "${token}" ]]; then
    echo "vault kubernetes auth login returned empty token" >&2
    return 1
  fi
  export VAULT_TOKEN="${token}"
}

take_raft_snapshot() {
  mkdir -p "${WORK_DIR}"
  local snap_path="${WORK_DIR}/${SNAPSHOT_NAME}"
  log "raft snapshot save ${snap_path}"
  vault operator raft snapshot save "${snap_path}"
  ls -lh "${snap_path}"
}

upload_crypt() {
  local snap_path="${WORK_DIR}/${SNAPSHOT_NAME}"
  local conf opw opw2
  conf="$(mktemp)"
  opw="$(rclone obscure "${CRED_PW}")"
  opw2="$(rclone obscure "${CRED_PW2}")"
  umask 077
  cat >"${conf}" <<EOF
[pcloud]
type = pcloud
hostname = ${CRED_HOSTNAME}
token = ${CRED_TOKEN}

[crypt]
type = crypt
remote = pcloud:${REMOTE_PREFIX}
password = ${opw}
password2 = ${opw2}
filename_encryption = standard
directory_name_encryption = false
EOF

  local dest="crypt:${TIMESTAMP}"
  log "rclone copy → pcloud:${REMOTE_PREFIX}/${TIMESTAMP}/"
  rclone --config "${conf}" copy "${snap_path}" "${dest}/" \
    --tpslimit 2 \
    --transfers 1 \
    --checkers 2 \
    --retries 5 \
    --low-level-retries 10
  rm -f "${conf}"
  log "done ${dest}/${SNAPSHOT_NAME}"
}

prune_old() {
  local keep_sec
  keep_sec="$(parse_keep_within_seconds "${KEEP_WITHIN}")"
  local cutoff=$(( $(TZ=Asia/Seoul date +%s) - keep_sec ))

  local conf opw opw2
  conf="$(mktemp)"
  opw="$(rclone obscure "${CRED_PW}")"
  opw2="$(rclone obscure "${CRED_PW2}")"
  cat >"${conf}" <<EOF
[pcloud]
type = pcloud
hostname = ${CRED_HOSTNAME}
token = ${CRED_TOKEN}

[crypt]
type = crypt
remote = pcloud:${REMOTE_PREFIX}
password = ${opw}
password2 = ${opw2}
filename_encryption = standard
directory_name_encryption = false
EOF

  log "prune keepWithin=${KEEP_WITHIN} prefix=${REMOTE_PREFIX}"
  local dirs
  dirs="$(rclone --config "${conf}" lsf --dirs-only "crypt:" 2>/dev/null || true)"
  while IFS= read -r dir; do
    [[ -z "${dir}" ]] && continue
    local name="${dir%/}"
    if [[ ! "${name}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}$ ]]; then
      continue
    fi
    local ts_epoch
    ts_epoch="$(TZ=Asia/Seoul date -d "${name:0:10} ${name:11:2}:${name:13:2}:${name:15:2}" +%s 2>/dev/null || echo 0)"
    if (( ts_epoch > 0 && ts_epoch < cutoff )); then
      log "prune delete ${name}"
      rclone --config "${conf}" purge "crypt:${name}" || true
    fi
  done <<<"${dirs}"
  rm -f "${conf}"
}

# --- main ---
log "start ns=${NS} leaf=${LEAF_NAME} ts=${TIMESTAMP}"
install_vault_cli
resolve_cluster_name
init_run_ids
acquire_lease
vault_k8s_login
take_raft_snapshot
read_platform_creds
upload_crypt
prune_old
log "ok"
