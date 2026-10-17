# Helm 차트·이미지 버전이 코드 곳곳에 흩어져 서로 어긋남

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-17 |
| **우선순위** | 중간 |
| **영역** | `infra/*/src/contract.ts`, `common/custom-resources`, `.github/workflows/upgrade-develop.yml` |
| **관련 코드** | `infra/k8s-workstation-system/src/contract.ts:432`, `common/custom-resources/src/components/adapter/sftp.v3.component.ts:22`, `common/custom-resources/src/components/backup/vault-raft-archive.v1.component.ts:19` |
| **상태** | **조사중** |

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

## 수용 기준

- [ ] Vault 버전이 한 상수에서 나오고 provider override·Job·archive가 모두 그 값을 쓴다
- [ ] 모든 Helm 차트 버전이 SSOT 파일에 있고 contract는 참조만 한다
- [ ] Renovate가 develop 대상으로 Helm·이미지 PR을 연다 (dry-run 로그 또는 첫 PR로 확인)
- [ ] 라이브 Istio sidecar가 control plane과 같은 버전 (재시작 후 확인)

## 범위 밖

- Kubespray가 관리하는 컨트롤 플레인 이미지 (`docs/issues/2026-10-13-kubernetes-1-36-upgrade.md`)
- 실제 메이저 버전 업그레이드 (각자 이슈)

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-17 | 등록. Nova 리포트·live pod 이미지 대조로 Vault 버전 3중 불일치 확인 |
