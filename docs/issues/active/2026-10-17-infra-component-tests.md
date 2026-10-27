# infra 스택 테스트 0개 — 핵심 컴포넌트 렌더링 테스트 도입

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-17 |
| **우선순위** | 낮음~중간 |
| **영역** | `infra/*/test`, jest 설정 (`projenrc/projects/pulumi-projects.ts`) |
| **선행** | [Jest 유닛 테스트 도입](../resolved/2026-09-08-jest-unit-test-setup.md), [contract 분해](2026-10-17-system-contract-split.md) (contract 수준 테스트는 분해 후) |
| **상태** | **보류** — 컴포넌트 단위는 바로 가능, contract 단위는 분해 후 |

## 배경

`common/*`에는 테스트 25개가 있다. `infra/*/test/`는 5개 스택 모두 `tsconfig.json`만 있고 테스트가 없다. Helm values·리소스 opts 회귀는 preview로만 잡힌다.

## 목표

- Pulumi `runtime.setMocks`로 컴포넌트를 생성해 렌더링된 Helm values·리소스 입력을 검증
- 첫 대상: Vault helm chart(TLS·KMS·PVC), Authentik(CNPG 외부 DB 값), qBittorrent/Jellyfin PVC (`protect` 회귀 — [protect 이슈](../resolved/2026-10-17-stateful-resource-protect.md) 연계)

## 수용 기준

- [ ] 최소 3개 컴포넌트 테스트가 `pnpm test:workspaces`에서 실행·통과
- [ ] 상태 보존 리소스가 `protect: true`인지 검증하는 테스트 포함
- [ ] PR Validate에서 함께 실행됨 (추가 설정 불필요 확인)

## 범위 밖

- contract 전체 통합 테스트 (분해 후 별도)
- live 클러스터 대상 e2e

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-17 | 등록 |
