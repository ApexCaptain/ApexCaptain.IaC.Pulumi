# PR 검증(pr-validation) 중복 실행으로 CI가 느림

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-11-04 |
| **영역** | GitHub Actions `pr-validation`, Projen 워크플로, turbo |
| **관련 코드** | `projenrc/workflows/pr-validation.ts`, `.projenrc.ts` (스크립트·`turbo.json`), `.github/workflows/pr-validation.yml` |
| **선행** | [PR CI 검증 파이프라인](../resolved/2026-09-11-pr-ci-validation-pipeline.md) |
| **관련** | [CI pulumi preview·drift](2026-10-17-ci-pulumi-preview-drift.md) (별 이슈 — preview는 여기 범위 밖) |
| **계획** | [docs/superpowers/plans/2026-11-04-pr-validation-speedup.md](../../superpowers/plans/2026-11-04-pr-validation-speedup.md) |
| **상태** | **진행중** — Phase 1·2 실증 완료. Phase 3(변경 패키지 필터) 착수 여부 대기 |
| **근거** | Grok 자문 `tmp/advisor/pr-validation-speedup.md` + 로컬 코드 대조 (2026-11-04) |

## 배경

`pr-validation`은 `main`/`develop` PR에서 정적 검증만 한다. 시크릿 없음. concurrency cancel-in-progress는 이미 켜져 있다.

최근 완료 실행 20회(성공 19, 취소 1) 중앙값 기준 전체 job **약 471초**. 그중 Build workspaces **약 298초**, Test workspaces **약 97초**, ESLint **약 44초**.

## 문제

같은 검증을 여러 번 돈다.

1. `pnpm build:workspaces` → `turbo run build` → 각 패키지 `projen build` = compile → **test**(jest + eslint) → package
2. `pnpm test:workspaces` → jest + 패키지 eslint **다시**
3. `pnpm eslint` → 루트 eslint 후 `posteslint`로 패키지 eslint **또**

결과: jest 2회, 패키지 ESLint 3회. 검증 범위는 안 늘고 wall time만 는다. turbo 로컬 캐시(`.turbo`)는 CI run 사이에 저장되지 않아 run마다 cold다. path filter도 없어 패키지 1개만 바뀐 PR도 전량 검증한다.

## 접근 비교

| 안 | 내용 | 장점 | 단점 | 추천 |
|---|---|---|---|---|
| **1-A** | CI를 `turbo run compile` + `test:workspaces` + 루트-only eslint | build 안 test/package 제거 시도 | `turbo.json`의 `compile.dependsOn: ['^build']` 때문에 의존 패키지에 full `build`가 다시 붙음. A만으론 중복이 안 사라질 수 있음 | 보류 (dependsOn을 `^compile`으로 바꿀 때 재검토) |
| **1-B** | `build:workspaces` 유지, `test:workspaces` 단계 제거, ESLint를 `pnpm exec projen eslint`(루트만) | 변경 최소. jest·패키지 eslint는 build 안 1회, 루트 eslint 1회. 수용 기준 충족 | PR에서 `package` 단계는 그대로 (낭비지만 중복 아님) | **Phase 1 채택** |
| **2** | `actions/cache`로 `.turbo` 저장 | 변경 적은 PR에서 재실행 비용↓ | `test`/`eslint`에 inputs·outputs 빈약. 중복 제거 전이면 캐시 단위가 지저분 | Phase 2 |
| **3** | `turbo --filter "...[origin/base]"` + `fetch-depth: 0` | 단일 패키지 PR에서 크게 절약 | 루트 설정·lockfile 변경 시 전량 필요. fork/base ref 주의 | Phase 3 |
| **4** | test/lint 병렬 job | wall time↓ 가능 | job마다 설치 15~20초, runner 분↑ | Phase 1~3 이후, 측정 보고 결정 |
| **5** | ESLint `--cache`, jest swc, tsconfig incremental 등 | 추가 미세 절약 | 효과 미측정 | Phase 1~3 이후 |

## 추천

1. **Phase 1 = 1-B** (중복 제거). 검증 범위 유지.
2. Phase 1 머지 후 CI 시간 재측정.
3. **Phase 2** turbo 캐시, **Phase 3** 변경 패키지 필터는 각각 별 커밋/PR.
4. 병렬 job·변환기 튜닝은 후순위.

## 수용 기준

- [x] PR 검증에서 각 워크스페이스 패키지의 compile·jest·패키지 ESLint, 그리고 루트 ESLint가 **최소 1회** 실행된다 (0회로 줄지 않음) — CI: `build:workspaces` + `pnpm exec projen eslint` (로컬 워크플로 대조)
- [x] 같은 PR 경로에서 jest·패키지 ESLint가 **의도적 중복 없이** 1회만 돈다 — CI에서 `test:workspaces`·`posteslint` 경로(`pnpm eslint`) 제거 확인
- [x] SSOT는 `projenrc/workflows/pr-validation.ts` (+ 필요 시 `.projenrc.ts`). 생성 YAML 손수정 없음. `pnpm exec projen` 후 생성물 커밋 — [#185](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/pull/185)
- [x] Phase 1 적용 후 `pr-validation` 전체 job이 적용 전(약 471초)보다 유의미하게 감소 — run `41780087910` job **190초** (Build 168 · ESLint 4 · Test workspaces 없음). 기준 대비 약 **281초(~60%)** 단축. 단, 1회 실측(중앙값 아님)
- [x] Phase 2 별 PR·캐시 동작 확인 — [#188](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/pull/188) miss→save(`41781495261`) + restore hit·FULL TURBO(`41782722013` job **~41s**, Build ~0s)
- [ ] Phase 3(변경 패키지 필터) 별 PR·범위 유지 확인

## 범위 밖

- `pulumi preview` / drift ([별 이슈](2026-10-17-ci-pulumi-preview-drift.md))
- 더 큰 GitHub-hosted runner
- 로컬 `pnpm test` / `posttest` / `posteslint` / `postbuild` 훅 제거 (로컬 DX는 유지. CI 단계만 정리)
- A안용 `compile.dependsOn: ['^compile']` 계약 변경 (별 후속)

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-11-04 | 등록. Grok 자문 대조 후 1-B 채택·3 Phase 계획 작성 |
| 2026-11-04 | Phase 1: `test:workspaces` 제거, ESLint를 `pnpm exec projen eslint`로 변경. projen 재생성·로컬 검증 통과 |
| 2026-11-04 | Phase 1 로컬 게이트 확인. 원격 pr-validation·시간 측정은 커밋/PR 후 |
| 2026-11-04 | [#185](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/pull/185) `pr-validation` success. job 190s (Build 168 / ESLint 4). 이전 중앙값 ~471s 대비 ~281s 단축. Test workspaces step 없음 확인 |
| 2026-11-04 | Phase 2: `pr-validation`에 `actions/cache@v6.1.0`(SHA pin)로 `.turbo` 캐시 추가. turbo inputs 보강은 보류 |
| 2026-11-04 | [#188](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/pull/188) 1차 CI `41781495261`: cache miss → save (~1.8MB). job ~345s (cold Build ~309) |
| 2026-11-04 | [#188](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/pull/188) 2차 CI `41782722013`: restore-key hit → FULL TURBO. job **~41s** (Build ~0s). Phase 2 머지 |
