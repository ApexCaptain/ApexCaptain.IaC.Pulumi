#!/usr/bin/env bash
# Lane A orchestrator — Lease → VolumeSnapshot → clone → worker Job → prune → cleanup
# Env set by CronJob (PvcSnapshotArchiveV1Component).
set -euo pipefail

: "${NS:?}"
: "${SRC_PVC:?}"
: "${SNAP_CLASS:?}"
: "${CRED_SECRET:?}"
: "${SA:?}"
: "${LANE:?}"
: "${KEEP_WITHIN:?}"
: "${PLATFORM_NS:?}"
: "${LEASE_NAME:?}"
: "${SCRIPT_CM:?}"
: "${RESOURCE_PREFIX:?}"
: "${PLATFORM_CONFIG_CM:?}"

# Optional — empty → read from platform ConfigMap
CLUSTER="${CLUSTER:-}"

# Optional overrides — empty → inherit from source PVC at runtime
CLONE_STORAGE_CLASS="${CLONE_STORAGE_CLASS:-}"
CLONE_SIZE="${CLONE_SIZE:-}"

ALPINE_IMAGE="${ALPINE_IMAGE:-alpine:3.21}"
LEASE_WAIT_SEC="${LEASE_WAIT_SEC:-600}"
SNAP_WAIT_SEC="${SNAP_WAIT_SEC:-600}"
CLONE_WAIT_SEC="${CLONE_WAIT_SEC:-600}"
WORKER_WAIT_SEC="${WORKER_WAIT_SEC:-1800}"

TIMESTAMP="$(TZ=Asia/Seoul date +%Y-%m-%d_%H%M%S)"
# REMOTE_PREFIX / names set after resolve_cluster_name + init_run_ids
SNAP_NAME=""
CLONE_NAME=""
WORKER_JOB=""
HOLDER=""
REMOTE_PREFIX=""
RUN_TOKEN=""

cleanup() {
  local code=$?
  set +e
  echo "[orch] cleanup (exit=${code})"
  kubectl delete job -n "${NS}" "${WORKER_JOB}" --ignore-not-found=true --wait=false >/dev/null 2>&1
  kubectl delete pvc -n "${NS}" "${CLONE_NAME}" --ignore-not-found=true --wait=false >/dev/null 2>&1
  kubectl delete volumesnapshot -n "${NS}" "${SNAP_NAME}" --ignore-not-found=true --wait=false >/dev/null 2>&1
  release_lease || true
  exit "${code}"
}
trap cleanup EXIT

log() { echo "[orch] $*"; }

b64() {
  printf '%s' "$1" | base64 | tr -d '\n'
}

# DNS-1123 ≤63. stem truncate; suffix kept (-snap/-clone/-worker).
k8s_name() {
  local stem="$1" suffix="$2"
  local max=63
  local budget=$((max - ${#suffix}))
  if (( budget < 1 )); then
    echo "k8s_name: suffix too long (${suffix})" >&2
    return 1
  fi
  stem="${stem:0:${budget}}"
  while [[ "${stem}" == *- ]]; do
    stem="${stem%-}"
  done
  echo "${stem}${suffix}"
}

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
  # sets: CRED_HOSTNAME CRED_TOKEN CRED_PW CRED_PW2
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
  REMOTE_PREFIX="k8s-backup/${CLUSTER}/${LANE}/${NS}/${SRC_PVC}"
  # 짧은 토큰 — prefix+pvc+ts 조합이 63자 넘는 것 방지
  RUN_TOKEN="$(printf '%s' "${SRC_PVC}|${TIMESTAMP}|$$" | sha256sum | awk '{print substr($1,1,12)}')"
  local stem="${RESOURCE_PREFIX}-${RUN_TOKEN}"
  SNAP_NAME="$(k8s_name "${stem}" "-snap")"
  CLONE_NAME="$(k8s_name "${stem}" "-clone")"
  WORKER_JOB="$(k8s_name "${stem}" "-worker")"
  HOLDER="${RESOURCE_PREFIX}-${RUN_TOKEN}-$$"
  log "runToken=${RUN_TOKEN} snap=${SNAP_NAME}"
}

# CLONE_* empty → source PVC storageClassName + capacity (fallback: requests.storage)
resolve_clone_spec() {
  local src_sc src_size
  src_sc="$(kubectl get pvc -n "${NS}" "${SRC_PVC}" -o jsonpath='{.spec.storageClassName}')"
  src_size="$(kubectl get pvc -n "${NS}" "${SRC_PVC}" -o jsonpath='{.status.capacity.storage}')"
  if [[ -z "${src_size}" ]]; then
    src_size="$(kubectl get pvc -n "${NS}" "${SRC_PVC}" -o jsonpath='{.spec.resources.requests.storage}')"
  fi
  if [[ -z "${src_sc}" || -z "${src_size}" ]]; then
    echo "failed to read source PVC ${NS}/${SRC_PVC} storageClass/size" >&2
    return 1
  fi
  if [[ -z "${CLONE_STORAGE_CLASS}" ]]; then
    CLONE_STORAGE_CLASS="${src_sc}"
    log "clone storageClass inherited=${CLONE_STORAGE_CLASS}"
  else
    log "clone storageClass override=${CLONE_STORAGE_CLASS}"
  fi
  if [[ -z "${CLONE_SIZE}" ]]; then
    CLONE_SIZE="${src_size}"
    log "clone size inherited=${CLONE_SIZE}"
  else
    log "clone size override=${CLONE_SIZE}"
  fi
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
    # Lease MicroTime은 마이크로초 필수 (…05Z 거부 → …05.000000Z)
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
      # resourceVersion test → 동시 acquire 레이스 완화
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

wait_snapshot_ready() {
  local deadline=$((SECONDS + SNAP_WAIT_SEC))
  while (( SECONDS < deadline )); do
    local ready err
    ready="$(kubectl get volumesnapshot -n "${NS}" "${SNAP_NAME}" -o jsonpath='{.status.readyToUse}' 2>/dev/null || true)"
    err="$(kubectl get volumesnapshot -n "${NS}" "${SNAP_NAME}" -o jsonpath='{.status.error.message}' 2>/dev/null || true)"
    if [[ "${ready}" == "true" ]]; then
      log "snapshot ready ${SNAP_NAME}"
      return 0
    fi
    if [[ -n "${err}" ]]; then
      echo "snapshot error: ${err}" >&2
      return 1
    fi
    sleep 3
  done
  echo "timeout waiting for snapshot ${SNAP_NAME}" >&2
  return 1
}

wait_pvc_bound() {
  local deadline=$((SECONDS + CLONE_WAIT_SEC))
  while (( SECONDS < deadline )); do
    local phase
    phase="$(kubectl get pvc -n "${NS}" "${CLONE_NAME}" -o jsonpath='{.status.phase}' 2>/dev/null || true)"
    if [[ "${phase}" == "Bound" ]]; then
      log "clone PVC bound ${CLONE_NAME}"
      return 0
    fi
    sleep 3
  done
  echo "timeout waiting for clone PVC ${CLONE_NAME}" >&2
  return 1
}

wait_job_complete() {
  local job="$1"
  local deadline=$((SECONDS + WORKER_WAIT_SEC))
  while (( SECONDS < deadline )); do
    local succeeded failed
    succeeded="$(kubectl get job -n "${NS}" "${job}" -o jsonpath='{.status.succeeded}' 2>/dev/null || true)"
    failed="$(kubectl get job -n "${NS}" "${job}" -o jsonpath='{.status.failed}' 2>/dev/null || true)"
    if [[ "${succeeded}" == "1" ]]; then
      log "worker job succeeded ${job}"
      return 0
    fi
    if [[ -n "${failed}" && "${failed}" != "0" ]]; then
      kubectl logs -n "${NS}" "job/${job}" --tail=200 || true
      echo "worker job failed ${job}" >&2
      return 1
    fi
    sleep 5
  done
  echo "timeout waiting for worker job ${job}" >&2
  return 1
}

prune_old() {
  local keep_sec
  keep_sec="$(parse_keep_within_seconds "${KEEP_WITHIN}")"
  local cutoff=$(( $(TZ=Asia/Seoul date +%s) - keep_sec ))

  read_platform_creds
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
    # 폴더명은 Asia/Seoul wall-clock
    ts_epoch="$(TZ=Asia/Seoul date -d "${name:0:10} ${name:11:2}:${name:13:2}:${name:15:2}" +%s 2>/dev/null || echo 0)"
    if (( ts_epoch > 0 && ts_epoch < cutoff )); then
      log "prune delete ${name}"
      rclone --config "${conf}" purge "crypt:${name}" || true
    fi
  done <<<"${dirs}"
  rm -f "${conf}"
}

# --- main ---
log "start ns=${NS} pvc=${SRC_PVC} ts=${TIMESTAMP}"
resolve_cluster_name
init_run_ids
log "remote=${REMOTE_PREFIX}"
acquire_lease
resolve_clone_spec

log "create VolumeSnapshot ${SNAP_NAME}"
kubectl apply -f - <<EOF
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: ${SNAP_NAME}
  namespace: ${NS}
  labels:
    app.kubernetes.io/name: ${RESOURCE_PREFIX}
    backup.apexcaptain.com/pvc: ${SRC_PVC}
spec:
  volumeSnapshotClassName: ${SNAP_CLASS}
  source:
    persistentVolumeClaimName: ${SRC_PVC}
EOF
wait_snapshot_ready

log "create clone PVC ${CLONE_NAME}"
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${CLONE_NAME}
  namespace: ${NS}
  labels:
    app.kubernetes.io/name: ${RESOURCE_PREFIX}
    backup.apexcaptain.com/pvc: ${SRC_PVC}
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: ${CLONE_STORAGE_CLASS}
  resources:
    requests:
      storage: ${CLONE_SIZE}
  dataSource:
    name: ${SNAP_NAME}
    kind: VolumeSnapshot
    apiGroup: snapshot.storage.k8s.io
EOF
wait_pvc_bound

# secretKeyRef 크로스-NS 불가 → base64 env로 worker에 전달 (워크로드 Secret 불필요)
log "create worker Job ${WORKER_JOB}"
read_platform_creds
HN_B64="$(b64 "${CRED_HOSTNAME}")"
TK_B64="$(b64 "${CRED_TOKEN}")"
PW_B64="$(b64 "${CRED_PW}")"
PW2_B64="$(b64 "${CRED_PW2}")"
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: ${WORKER_JOB}
  namespace: ${NS}
  labels:
    app.kubernetes.io/name: ${RESOURCE_PREFIX}
    backup.apexcaptain.com/role: worker
    backup.apexcaptain.com/pvc: ${SRC_PVC}
spec:
  backoffLimit: 1
  ttlSecondsAfterFinished: 3600
  template:
    metadata:
      labels:
        app.kubernetes.io/name: ${RESOURCE_PREFIX}
        backup.apexcaptain.com/role: worker
    spec:
      restartPolicy: Never
      serviceAccountName: ${SA}
      containers:
        - name: worker
          image: ${ALPINE_IMAGE}
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-ec"]
          args:
            - |
              echo "https://dl-cdn.alpinelinux.org/alpine/v3.21/community" >> /etc/apk/repositories
              apk add --no-cache bash curl rclone zstd tar coreutils
              exec bash /scripts/worker.sh
          env:
            - name: TIMESTAMP
              value: "${TIMESTAMP}"
            - name: REMOTE_PREFIX
              value: "${REMOTE_PREFIX}"
            - name: PCLOUD_HOSTNAME_B64
              value: "${HN_B64}"
            - name: PCLOUD_TOKEN_B64
              value: "${TK_B64}"
            - name: CRYPT_PASSWORD_B64
              value: "${PW_B64}"
            - name: CRYPT_PASSWORD2_B64
              value: "${PW2_B64}"
          volumeMounts:
            - name: data
              mountPath: /data
              readOnly: true
            - name: scripts
              mountPath: /scripts
              readOnly: true
            - name: work
              mountPath: /work
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: "1"
              memory: 1Gi
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: ${CLONE_NAME}
        - name: scripts
          configMap:
            name: ${SCRIPT_CM}
            defaultMode: 0755
        - name: work
          emptyDir: {}
EOF

wait_job_complete "${WORKER_JOB}"

# prune needs rclone on orchestrator
echo "https://dl-cdn.alpinelinux.org/alpine/v3.21/community" >> /etc/apk/repositories
apk add --no-cache rclone >/dev/null
prune_old

log "success ${REMOTE_PREFIX}/${TIMESTAMP}"
