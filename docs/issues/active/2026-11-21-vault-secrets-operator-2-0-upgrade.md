# vault-secrets-operator 2.0.0 업그레이드 — 릴리스 노트 대기

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-11-21 |
| **영역** | vault-secrets-operator Helm 차트 (`k8s-workstation-system`) |
| **관련 코드** | `common/utils/src/configs/versions.config.ts` (`vaultSecretOperator`), `infra/k8s-workstation-system/src/components/vault-secrets-operator/vault-secrets-operator.helm-chart.component.ts` |
| **상태** | **보류** — 차트 2.0.0은 나왔으나 공식 릴리스 노트 없음. 노트 확인 후 진행 |

## 배경

2026-11-21 Nova 진단(`docs/diagnosis/nova.diagnosis.md`)에서 나온 Helm 차트 최신화 중 VSO만 메이저(1.6.2 → 2.0.0)라 분리했다. 나머지 9개 차트는 같은 날 적용했다.

## 현재 상태

- 클러스터·SSOT: 차트 `1.6.2` (앱 1.6.2)
- 최신: 차트 `2.0.0` (앱 2.0.0)
- VSO 리소스 13개 (VaultConnection·VaultAuth·VaultStaticSecret 등)가 `secrets.hashicorp.com/v1beta1` 사용

## 실측 (차트 1.6.2 vs 2.0.0, 현재 user values로 `helm template`)

| 항목 | 내용 | 영향 |
|---|---|---|
| `kube-rbac-proxy` 사이드카 제거 | 매니저가 `--metrics-bind-address=:8443 --metrics-secure=true`로 metrics를 직접 서빙. Service 포트 8443 동일 | 우리 `controller.kubeRbacProxy.resources` 값이 **무효** (렌더는 통과, 조용히 무시). 코드에서 블록 삭제 필요. metrics 소비 코드 없음 |
| values 키 제거 | `controller.kubeRbacProxy.*` 7개 | 위와 동일 |
| values 키 추가 | `certManager.approverRBAC.*` | 기본값 사용. cert-manager 설치돼 있음 |
| CRD | 기존 CRD는 모두 `v1beta1` 유지, 설명·선택 필드(`InstantUpdates` 등) 추가뿐. 신규 `vaultissuers`, `vaultclusterissuers` | 기존 리소스 영향 없음. `hooks.upgradeCRDs.enabled: true`(기본)로 pre-upgrade 훅이 CRD 갱신 |
| RBAC | cert-manager `certificaterequests` 권한, issuer editor/viewer role 추가 | 영향 없음 |
| `values.schema.json` | 1.6.2·2.0.0 모두 없음 | 스키마 충돌 검사 불가 → 키 diff·렌더로 대체 |

## 문제

- 공식 CHANGELOG 최신 항목이 1.6.2(2026-10-21). GitHub `v2.0.0` 릴리스 페이지 404 (2026-11-21 확인)
- 메이저 버전의 동작 변경(breaking change)을 확인할 수 없다
- VSO 장애 시 기존 Secret은 남지만 회전·갱신이 멈춘다 (Vault CA 회전 이력: [Vault CA 회전 신뢰 전파](2026-10-25-vault-ca-rotation-trust-propagation.md))

## 추천

공식 릴리스 노트 공개까지 보류. 공개되면 breaking change 확인 → 코드 정리 → 단독 배포.

## 수용 기준

- [ ] VSO 2.0.0 공식 릴리스 노트(CHANGELOG / GitHub release) 확인, breaking change 정리
- [ ] `vault-secrets-operator.helm-chart.component.ts`에서 `kubeRbacProxy` 블록 삭제
- [ ] `versions.config.ts` `vaultSecretOperator` → `2.0.0`, preview에서 Release 외 변경 없음 확인
- [ ] 배포 전후 클러스터 전체 점검, CRD 갱신 훅 Job 성공
- [ ] 모든 VaultStaticSecret·VaultDynamicSecret 동기화 정상, VaultConnection/VaultAuth valid
- [ ] 매니저 메모리 VPA 재확인 (kube-rbac-proxy 역할 흡수)

## 범위 밖

- 신규 `VaultIssuer`/`VaultClusterIssuer` 도입 검토 — 필요하면 별도 이슈
- 1.6.0에서 제거된 HCP CRD(`hcpauths`, `hcpvaultsecretsapps`) 잔존 정리 — 별도 이슈

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-11-21 | 등록. Nova 기반 차트 최신화 중 메이저라 분리. 차트 diff 실측, 릴리스 노트 부재로 보류 |
