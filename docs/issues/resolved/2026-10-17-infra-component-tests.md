# infra 스택 테스트 0개 — 핵심 컴포넌트 렌더링 테스트 도입

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-17 |
| **우선순위** | 낮음~중간 |
| **영역** | `infra/*/test`, jest 설정 (`projenrc/projects/pulumi-projects.ts`) |
| **선행** | [Jest 유닛 테스트 도입](../resolved/2026-09-08-jest-unit-test-setup.md), [contract 분해](2026-10-17-system-contract-split.md) (contract 수준 테스트는 분해 후) |
| **상태** | **해결** — 컴포넌트 단위 4개 (#157) + system contract 단위 (#160) |
| **해결일** | 2026-10-28 |

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

### contract 단위 (2026-10-28)

`infra/k8s-workstation-system/test/contract.test.ts` — [contract 분해](2026-10-17-system-contract-split.md) 후 system contract 전체를 mock으로 inflate한다.

- ESC: `nexus.esc` 각 zod 스키마(`_zod.def`)를 따라 가짜 값을 채워 `setAllConfig`. 파싱되는 kubeconfig만 형식 맞춤. zod 의존성 추가 없음
- cloudflare·github contract: StackReference mock `outputs`로 필요한 키만 제공
- mock `newResource`는 parent·`dependsOn`을 안 받으므로 `@pulumi/pulumi/runtime/resource`의 `registerResource`를 감싸 기록
- mock 보정: Command `stdout`(bootstrap token), K8s Secret `data`(ca.crt·token), invoke `id`·`result`

| 테스트 | 검증 |
|---|---|
| 최상위 리소스 snapshot | `type::name` 59개. live state(`pulumi stack export`)의 최상위 명시 리소스와 일치 (기본 provider·StackReference 제외) |
| output·secret 키 경로 snapshot | 키 순서 (contract hash가 `JSON.stringify`에 의존) |
| `dependsOn` 12개 | contract JSDoc 순서 제약 (cert-manager → Vault/ingress, Longhorn·CNPG → Authentik, ProviderProxy → Outpost → proxy 앱 등) |

변형 확인: Outpost 이름 변경 → snapshot 실패, Outpost `dependsOn`에서 longhornServiceMesh 제거 → 해당 케이스 실패, output 키 순서 교환 → hash 케이스 실패.

## 수용 기준

- [x] 최소 3개 컴포넌트 테스트가 `pnpm test:workspaces`에서 실행·통과 — 4개 파일 16 케이스, 16 tasks 성공
- [x] 상태 보존 리소스가 `protect: true`인지 검증하는 테스트 포함
- [x] PR Validate에서 함께 실행됨 (추가 설정 불필요 확인) — `pr-validation.yml`이 `pnpm test:workspaces` 실행. [#157](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/pull/157) CI에서 system 10·tools 3·apps 3 통과 확인
- [x] (contract 분해 후) contract 단위 테스트 — system contract 14 케이스. system jest 3 suites 24 tests 통과

## 범위 밖

- contract 전체 통합 테스트 (분해 후 별도)
- live 클러스터 대상 e2e

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-17 | 등록 |
| 2026-10-28 | 컴포넌트 단위 적용: infra jest 활성화, 공용 mock 헬퍼, Vault·Authentik·qBittorrent·Jellyfin 테스트 4개. 상태 → 적용 (contract 단위 남음) |
| 2026-10-28 | [#157](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/pull/157) develop 머지. PR Validate 로그에서 infra 테스트 16개 실행·통과 확인 |
| 2026-10-28 | system contract 단위 테스트 추가 (`refactor/system-contract-phases`): 최상위 리소스·output 키 snapshot + `dependsOn` 12개. 변형 3종 실패 확인 |
| 2026-10-28 | CI에서 contract 테스트 첫 실패: 실제 `Contract`가 gitignore된 `Pulumi*.yaml`(projen 생성물)을 찾음. `Contract`를 jest mock 더블로 바꿔 해결. [#160](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/pull/160) PR Validate에서 `contract.test.ts` PASS 확인 후 머지. 해결 (tools contract 테스트는 [tools 분해 이슈](../active/2026-10-28-tools-contract-split.md) 수용 기준에 포함) |
