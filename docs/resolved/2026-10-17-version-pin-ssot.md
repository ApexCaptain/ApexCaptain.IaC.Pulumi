# Helm 차트·이미지 버전이 코드 곳곳에 흩어져 서로 어긋남

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-17 |
| **우선순위** | 중간 |
| **영역** | `infra/*/src/contract.ts`, `common/custom-resources`, `.github/workflows/upgrade-develop.yml` |
| **관련 코드** | `infra/k8s-workstation-system/src/contract.ts:432`, `common/custom-resources/src/components/adapter/sftp.v3.component.ts:22`, `common/custom-resources/src/components/backup/vault-raft-archive.v1.component.ts:19` |
| **상태** | **해결** |
| **해결일** | 2026-10-17 |
| **플랜** | [`docs/superpowers/plans/2026-10-17-version-pin-ssot.md`](../superpowers/plans/2026-10-17-version-pin-ssot.md) |

## 해결 요약

버전 SSOT(`common/utils/src/configs/versions.config.ts`) 도입. Vault 버전(provider override·Helm tag·Job·archive·Coder CLI)을 `vaultVersion` 하나로 묶고 2.0.4로 정렬했다. Helm 차트 25개가 SSOT를 참조한다. Istio sidecar를 control plane(1.30.6)과 맞췄다. Renovate 자동 업데이트는 하지 않기로 했다 (결정 D5). 필요해지면 새 이슈로 등록한다.

## 배경

Helm 차트 `version: '...'` 25개가 각 `contract.ts` 안에 인라인으로 있다. 보조 이미지(Job·sidecar 등)는 컴포넌트 상수로 따로 핀돼 있다. `upgrade-develop` 워크플로는 npm 의존성만 올린다. Helm·이미지 drift는 `docs/diagnosis/nova.diagnosis.md`를 사람이 읽어야 안다.

## 증상 (2026-10-17 실측)

| 대상 | 코드 핀 | 라이브 | 비고 |
|---|---|---|---|
| Vault 서버 | Helm 차트 `vault-0.34.1` | `vault-0` = `hashicorp/vault:2.0.4` | |
| `vaultVersionOverride` (Vault provider) | `contract.ts:432` `serverVersion: '2.0.3'` | 서버 2.0.4 | 서버 업그레이드 때 안 따라감 |
| sftp adapter Job | `sftp.v3.component.ts:22` `hashicorp/vault:2.0.3` | 2.0.3 | 서버와 불일치 |
| vault raft archive | `vault-raft-archive.v1.component.ts:19` 주석 "2.0.4와 맞춤" | 2.0.4 | 수동 동기화 |
| Istio sidecar | — | Running pod `proxyv2:1.30.5`, ingressgateway `1.30.6` | 업그레이드 후 워크로드 재시작 안 됨 |
| `opstree/redis` (argo-cd) | Redis Operator 기본값 | `v7.0.15` | latest minor `v7.4.11` |

같은 소프트웨어 버전을 여러 곳에 손으로 맞춰야 하고, 하나를 빠뜨려도 아무 검사가 없다.

## 목표

- 버전 SSOT 한 곳 (예: 스택별 `versions.ts` 또는 `common/utils` 상수). 같은 소프트웨어는 한 상수를 참조
- Renovate(또는 동등 도구)가 SSOT를 읽어 Helm·이미지 업데이트 PR을 자동 생성
- Istio 업그레이드 뒤 sidecar 재시작 절차가 문서·자동화에 포함

## 접근 비교

| 안 | 장점 | 단점 |
|---|---|---|
| A. Renovate + `customManagers` regex (주석 마커 `// renovate: datasource=helm ...`) | Helm·docker 모두 지원, PR 단위 리뷰 | Renovate App 설치, 마커 유지 |
| B. 자체 스크립트 (Nova 결과로 PR 생성) | 기존 Nova 재사용 | 직접 유지보수, latest 판단 로직 필요 |
| C. SSOT만 하고 업데이트는 수동 | 작업 최소 | drift 감지 여전히 사람 몫 |

## 추천

A. 1단계로 SSOT 파일 도입 + 불일치 3건(Vault) 정리, 2단계로 Renovate 연결.

## 결정 (2026-10-17 사용자 확정)

| # | 결정 |
|---|---|
| D1 | CI preview·drift 이슈를 선행으로 두지 않는다. schedule 트리거 해제 |
| D2 | SSOT는 `common/utils/src/configs/versions.config.ts` 한 파일 |
| D3 | Renovate는 이번 단계에서 뺀다 (2단계, 별도 착수) |
| D4 | Istio sidecar 재시작은 실행 에이전트(Composer)가 수행 |
| D5 | Renovate는 당분간 하지 않는다. 버전 갱신은 SSOT 값을 직접 고친다 (2026-10-17) |

## 현재 (1단계 적용)

**SSOT:** `common/utils/src/configs/versions.config.ts` — `vaultVersion`, `istioVersion`, `helmChartVersions`, `containerImages`. contract·컴포넌트는 `utils.configs.*` 참조만.

**버전 올리기:** SSOT 값 수정 → `k8s-workstation-system` / `apps` / `tools` 각각 `pulumi preview --stack prod` → `pulumi up --stack prod`. `istioVersion`을 올렸으면 Task 4(플랜)처럼 sidecar 워크로드 재시작.

**아직 SSOT로 안 옮긴 floating 태그:** `busybox`, `qmcgaw/gluetun:v3`, `postgres:18-alpine`, `serjs/go-socks5-proxy:latest`, SftpV1 `atmoz/sftp:alpine` 등 (태그 고정은 범위 밖).

**Task 4에서 재시작 안 한 Pod (Job/CronJob):**

| namespace | pod | proxy 이미지 | owner |
|---|---|---|---|
| jellyfin | `jellyfin-sftp-adapter-sftp-user-rotate-29846520-5r6kn` | `proxyv2:1.30.4-distroless` | Job (완료 Job, 자연 종료 대기) |

운영 Deployment 4개 재시작: `authentik` outpost·server·worker, `jellyfin`. jellyfin은 GPU 1대라 `rollout restart` 중 Pending → 클러스터에서 `maxSurge: 0` 임시 패치 후 Pod 재생성.

**후속 정리 (2026-10-17):**

- jellyfin 임시 패치를 코드로 이전: `jellyfin.helm-chart.component.ts` values `deploymentStrategy` (`RollingUpdate`, `maxSurge: 0`, `maxUnavailable: 1`). 라이브 값과 같아 Pod 재시작 없음
- Coder 워크스페이스 Vault CLI(`vault-login.sh.tpl`, 기존 `1.21.4` 하드코딩)도 SSOT 참조: tfvar `vault_cli_version` ← `utils.configs.vaultVersion`. 새 템플릿 버전(main·test) active, 기존 워크스페이스는 재시작·업데이트 시 2.0.4 설치

**prod 배포 (2026-10-17):** system/apps/tools `pulumi up` 완료. Vault provider·Helm `server.image.tag`·SFTP CronJob 이미지 `2.0.4`. system `secretHashFile` Command도 함께 update (허용 표 밖, 사용자 승인).

## 수용 기준

- [x] Vault 버전이 한 상수에서 나오고 provider override·Job·archive가 모두 그 값을 쓴다
- [x] 모든 Helm 차트 버전이 SSOT 파일에 있고 contract는 참조만 한다
- ~~Renovate가 develop 대상으로 Helm·이미지 PR을 연다~~ → 결정 D5로 범위 밖
- [x] 라이브 Istio sidecar가 control plane과 같은 버전 (재시작 후 확인; 위 Job 1개만 구버전 sidecar 잔존)

## 범위 밖

- Kubespray가 관리하는 컨트롤 플레인 이미지 (`docs/issues/2026-10-13-kubernetes-1-36-upgrade.md`)
- 실제 메이저 버전 업그레이드 (각자 이슈)
- Renovate 등 자동 업데이트 PR (결정 D5, 필요 시 새 이슈)

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-17 | 등록. Nova 리포트·live pod 이미지 대조로 Vault 버전 3중 불일치 확인 |
| 2026-10-17 | 결정 D1–D4. CI preview 선행 해제, 1단계 플랜 작성 (Composer 2.5 실행용) |
| 2026-10-17 | 1단계 적용. 버전 SSOT 도입, Vault 2.0.4 정렬, Istio sidecar 4개 워크로드 재시작 |
| 2026-10-17 | 점검 후속: jellyfin `maxSurge: 0` 코드화, Coder Vault CLI 버전 SSOT 연결 (1.21.4 → 2.0.4). apps·tools preview no-changes 확인 |
| 2026-10-17 | 결정 D5 (Renovate 보류). 해결, `docs/resolved`로 이동 |
