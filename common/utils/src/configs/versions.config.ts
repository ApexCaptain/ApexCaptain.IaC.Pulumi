/**
 * Helm 차트·컨테이너 이미지 버전 SSOT.
 *
 * 같은 소프트웨어 버전은 여기 상수 하나만 참조한다. 값을 바꾸면 이 상수를 쓰는 모든 스택을 preview한다.
 * floating 태그(busybox, gluetun:v3 등)는 아직 여기로 옮기지 않았다.
 * @see docs/resolved/2026-10-17-version-pin-ssot.md
 */

/** Vault 서버·CLI 공통. provider `vaultVersionOverride`, Helm `server.image.tag`, Job 이미지가 모두 이 값을 쓴다. */
export const vaultVersion = '2.0.4';

/** Istio 차트 = control plane = sidecar proxyv2. 올린 뒤에는 sidecar 워크로드를 재시작한다. */
export const istioVersion = '1.30.6';

export const helmChartVersions = Object.freeze({
  lxcfs: '0.2.8',
  genericDevicePlugin: '0.1.3',
  gpuOperator: 'v26.7.2',
  certManager: 'v1.21.2',
  snapshotController: '5.4.0',
  vault: '0.34.1',
  istio: istioVersion,
  postgresqlOperator: '0.29.1',
  redisOperator: '0.27.0',
  longhorn: '1.13.0',
  authentik: '2026.8.4',
  vpa: '5.1.0',
  goldilocks: '11.2.0',
  vaultSecretOperator: '1.6.0',
  reloader: '2.2.18',
  argoRollouts: '2.43.8',
  argoCd: '10.10.5',
  opentelemetryOperator: '0.126.1',
  victoriaMetrics: '0.49.0',
  loki: '19.0.0',
  tempo: '3.2.0',
  grafana: '14.0.1',
  jellyfin: '3.2.0',
  coder: '2.38.1',
  vikunja: '0.16.0',
} as const);

export const containerImages = Object.freeze({
  vault: `hashicorp/vault:${vaultVersion}`,
  alpine: 'alpine:3.21',
  atmozSftp:
    'atmoz/sftp:alpine@sha256:a6cb3eb29202ca7f57e73bb7e527286e66e0e822fff65609207c7e0ef2d135a3',
  alpineK8s: 'docker.io/alpine/k8s:1.35.4',
  argoCdRedis: 'quay.io/opstree/redis:v7.0.15',
  otelCollectorContrib:
    'ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib:0.156.0',
  vuetorrentMod: 'ghcr.io/vuetorrent/vuetorrent-lsio-mod:2.36.1',
  cloudflared:
    'cloudflare/cloudflared:2026.10.1@sha256:a15a3b50b8dabd57ac2090e9484c0247dba9dfa1f0df4d298d4317f9d69eb2d5',
} as const);
