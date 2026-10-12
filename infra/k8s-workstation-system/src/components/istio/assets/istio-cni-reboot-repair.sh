#!/bin/sh
set -eu

should_restart() {
  current=$1
  recorded=$2
  if [ "$current" = "$recorded" ]; then
    return 1
  fi
  return 0
}

wait_for_ztunnel() {
  node_name=$1
  while true; do
    ready=$(kubectl get pod -n istio-system -l app=ztunnel \
      --field-selector "spec.nodeName=${node_name}" \
      -o jsonpath='{range .items[*]}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' \
      2>/dev/null || true)
    if printf '%s\n' "$ready" | grep -qx True; then
      return 0
    fi
    echo "waiting for ztunnel Ready on ${node_name}"
    sleep 5
  done
}

main() {
  node_name=${NODE_NAME:?NODE_NAME is required}
  marker_dir=/host-run/istio-cni-reboot-repair
  marker=${marker_dir}/boot-id
  boot_id=$(cat /proc/sys/kernel/random/boot_id)
  recorded=
  if [ -f "$marker" ]; then
    recorded=$(cat "$marker")
  fi
  if ! should_restart "$boot_id" "$recorded"; then
    echo "istio-cni already repaired for boot ${boot_id}"
    return 0
  fi
  wait_for_ztunnel "$node_name"
  echo "ztunnel Ready, sleeping 60s before istio-cni restart"
  sleep 60
  kubectl delete pod -n istio-system -l k8s-app=istio-cni-node \
    --field-selector "spec.nodeName=${node_name}" \
    --wait=false
  mkdir -p "$marker_dir"
  printf '%s\n' "$boot_id" > "$marker"
  echo "deleted istio-cni-node on ${node_name} for boot ${boot_id}"
}

if [ "${ISTIO_CNI_REBOOT_REPAIR_SOURCED-}" != "1" ]; then
  main "$@"
  # 성공 뒤에도 프로세스를 유지한다. 바로 끝나면 kubelet이 재시작하고,
  # 마커가 있어 삭제는 한 번이지만 파드가 CrashLoop처럼 보인다.
  exec sleep infinity
fi
