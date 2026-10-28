# infra 스택 테스트 0개 — 핵심 컴포넌트 렌더링 테스트 도입

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-17 |
| **우선순위** | 낮음~중간 |
| **영역** | `infra/*/test`, jest 설정 (`projenrc/projects/pulumi-projects.ts`) |
| **선행** | [Jest 유닛 테스트 도입](../resolved/2026-09-08-jest-unit-test-setup.md), [contract 분해](2026-10-17-system-contract-split.md) (contract 수준 테스트는 분해 후) |
| **상태** | **적용** — 컴포넌트 단위 4개 스택 적용 (2026-10-28, `feat/infra-component-tests`). contract 단위는 분해 후 |

## 배경

`common/*`에는 테스트 25개가 있다. `infra/*/test/`는 5개 스택 모두 `tsconfig.json`만 있고 테스트가 없다. Helm values·리소스 opts 회귀는 preview로만 잡힌다.

## 목표

- Pulumi `runtime.setMocks`로 컴포넌트를 생성해 렌더링된 Helm values·리소스 입력을 검증
- 첫 대상: Vault helm chart(TLS·KMS·PVC), Authentik(CNPG 외부 DB 값), qBittorrent/Jellyfin PVC (`protect` 회귀 — [protect 이슈](../resolved/2026-10-17-stateful-resource-protect.md) 연계)

## 현재 (2026-10-28)

- jest: `projenrc/projects/pulumi-projects.ts`에 `jest` 옵션 추가, `k8s-workstation-system`·`tools`·`apps`만 켬 (`.projenrc.ts`). `github`·`cloudflare`는 테스트 대상이 생기면 켠다
- 공용 헬퍼: `common/utils/src/testing/` — `installPulumiMocks`, `unwrap`, `settle`, `revealSecrets`, `createResourceOptionsRecorder`. 런타임 index에서 export하지 않음. `common/custom-resources`·`common/nexus`의 `test/pulumi-mocks.ts`는 이 헬퍼의 얇은 래퍼로 바꿈
- `protect` 검증: mock `newResource`에는 리소스 옵션이 안 온다. 컴포넌트 `opts.transformations`에 기록용 transformation을 넣어 자식 옵션을 잡는다 (부모 → 자식 상속)
- `flat@6` ESM 전용 → infra jest `moduleNameMapper`가 `common/utils/src/testing/flat.shim.ts`로 돌림
- mock 입력은 하위에 secret이 섞이면 상위 객체째 secret 래퍼로 온다 → `revealSecrets`로 벗긴 뒤 검증

| 스택 | 테스트 | 검증 |
|---|---|---|
| system | `test/vault.helm-chart.component.test.ts` | protect(namespace·release), TLS listener, ocikms seal, raft PVC, Reloader annotation |
| system | `test/authentik.helm-chart.component.test.ts` | protect(namespace·CNPG), 내장 PG 비활성, DB host = CNPG `-rw` 서비스, 비밀번호 file 마운트 |
| tools | `test/qbittorrent.app.component.test.ts` | protect 대상 집합(modcache·incomplete 제외), ambient 제외 라벨, PVC 크기·클래스 |
| apps | `test/jellyfin.helm-chart.component.test.ts` | protect(namespace·config·media), persistence ↔ PVC 이름, GPU 1장·maxSurge 0 |

변형 확인: qBittorrent config PVC의 `statefulResourceOptions`를 빼면 protect 테스트가 해당 이름을 짚어 실패함.

## 수용 기준

- [x] 최소 3개 컴포넌트 테스트가 `pnpm test:workspaces`에서 실행·통과 — 4개 파일 16 케이스, 16 tasks 성공
- [x] 상태 보존 리소스가 `protect: true`인지 검증하는 테스트 포함
- [x] PR Validate에서 함께 실행됨 (추가 설정 불필요 확인) — `pr-validation.yml`이 `pnpm test:workspaces` 실행. 실제 CI 통과는 PR에서 확인
- [ ] (contract 분해 후) contract 단위 테스트 — 별도 진행

## 범위 밖

- contract 전체 통합 테스트 (분해 후 별도)
- live 클러스터 대상 e2e

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-17 | 등록 |
| 2026-10-28 | 컴포넌트 단위 적용: infra jest 활성화, 공용 mock 헬퍼, Vault·Authentik·qBittorrent·Jellyfin 테스트 4개. 상태 → 적용 (contract 단위 남음) |
