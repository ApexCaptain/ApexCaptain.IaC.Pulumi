# PR 원격 CI 검증 파이프라인 (build / test / eslint)

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-11 |
| **영역** | GitHub Actions, Projen 워크플로, PR 품질 게이트 |
| **관련 코드** | `.projenrc.ts`, `.github/workflows/`, `package.json` (`build:workspaces`, `test:workspaces`, `eslint`) |
| **선행** | [lint-staged pre-commit](../resolved/2026-09-06-lint-staged-pre-commit.md) (해결 — CI ESLint를 후속으로 명시), [Jest 유닛 테스트](../resolved/2026-09-08-jest-unit-test-setup.md) (해결 — GHA test workflow를 범위 밖으로 명시) |
| **출처** | Gemini 제안 `tmp/gemini/ci-validation-pipeline.plan.md` + 에이전트 리뷰 |
| **상태** | **해결** |
| **해결일** | 2026-09-11 |

## 해결 요약

`pr-validation` 워크플로 + `main`/`develop` ruleset(`Validate` required) 적용. [#40](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/pull/40) 머지.

## 배경

현재 PR CI는 `pull-request-lint.yml`만 있다. **PR 제목 semantic check**만 하고, 모노레포 빌드·유닛 테스트·ESLint는 원격에서 돌지 않는다.

품질 게이트는 사실상 로컬 Husky에 의존한다.

| 훅 | 하는 일 | 한계 |
|---|---|---|
| `pre-commit` | staged TS만 lint-staged | `--no-verify`, husky 미설치, GUI 커밋으로 우회 |
| `pre-push` | `pnpm test:workspaces` | 전량 eslint·`build:workspaces` 없음. 우회 가능 |
| 원격 PR | 제목만 | 머지 전 타입/린트/테스트 강제 없음 |

lint-staged·Jest 이슈에서 이미 “CI에 ESLint / test workflow”를 **별도 이슈로 분리**해 둔 상태다. 그 후속을 여기서 다룬다.

## 문제

1. Husky를 우회하면 깨진 타입이 PR에 들어올 수 있다.
2. pre-commit을 staged-only로 줄인 뒤, 원격 전량 린트 공백이 더 커졌다.
3. 유닛 테스트는 pre-push에만 있고, PR 게이트에는 없다.

## 목표

PR(`main` / `develop` 대상)에서 **시크릿·클라우드 자격 증명 없이** 정적 검증을 강제한다.

- `pnpm build:workspaces`
- `pnpm test:workspaces`
- `pnpm eslint` (루트 + `posteslint` turbo)

배포·`pulumi up`·`PULUMI_ACCESS_TOKEN`은 이 워크플로 범위 밖.

## 접근 비교

| 옵션 | 요지 | 장점 | 단점 |
|---|---|---|---|
| **A. Projen `GithubWorkflow`로 `pr-validation.yml` 신설** | `.projenrc.ts`가 SSOT. `pull_request` → checkout → Node/pnpm → frozen install → build/test/eslint | 기존 upgrade·PR lint와 같은 생성 경로. YAML 손수정 금지 규칙과 일치. Gemini 제안과 동일 뼈대 | 전량 실행이라 PR마다 무거울 수 있음 |
| B. Projen 기본 `buildWorkflow` 켜기 | 루트 TypeScriptProject 빌드 워크플로 재사용 | 설정 양 적음 | 이 레포는 `buildWorkflow: false` + turbo 모노레포. 루트 build ≠ `build:workspaces`. 맞추려면 결국 커스텀과 비슷해짐 |
| C. path filter / turbo affected만 | 변경 패키지만 검증 | CI 시간 절약 | 초기에 놓치는 깨짐 가능. 복잡도↑. 1차에는 과함 |

**추천: A.** 1차는 전량. 느리면 후속으로 affected/캐시 최적화.

## 추천 구현 요지

1. `.projenrc.ts`에만 워크플로 정의. `.github/workflows/pr-validation.yml` 손수정 금지.
2. 트리거: `pull_request` → `main`, `develop` (코드 검증은 `pull_request_target` 쓰지 않음. 제목 린트와 다름).
3. Steps 뼈대: checkout → `actions/setup-node` (버전 핀 + `cache: pnpm`) → `pnpm/action-setup` → `pnpm i --frozen-lockfile` → build → test → eslint.
4. `ESLINT_USE_FLAT_CONFIG=false` 등 기존 projen eslint task와 동일한 env 유지.
5. `permissions: contents: read`. 시크릿 주입 없음.
6. `concurrency`로 같은 PR의 이전 런 cancel-in-progress.
7. 기존 `pull-request-lint.yml`, `upgrade-develop.yml` 설정 파괴·덮어쓰기 금지.
8. projen 합성 후 **한 커밋** (projenrc + 생성 YAML). Gemini 플랜의 커밋 2개 분리는 불필요.
9. 워크플로만으로는 “강제”가 아니다. **branch protection / ruleset에 required check**를 걸어야 우회 방지 목표가 완성된다.

## 결정 (확정 2026-09-11)

사용자: 에이전트 추천 전부 수용.

| # | 항목 | 결정 |
|---|---|---|
| 1 | Required status check | 워크플로 + `main`/`develop` ruleset required **같이** |
| 2 | Job 구조 | **한 job 순차** (validate: build → test → eslint) |
| 3 | 머지 정책 | 로컬 전량 통과 확인 후 **바로 required** |
| 4 | 대상 브랜치 | **`main` + `develop`** |
| 5 | Node 버전 | **24** (DevContainer/로컬 `v24.21.0` major) |

## 수용 기준

- [x] `.projenrc.ts`에서 `pr-validation` 워크플로 정의. `pnpm exec projen`으로 `.github/workflows/pr-validation.yml` 생성
- [x] PR 이벤트에서 `build:workspaces` / `test:workspaces` / `eslint` 실행. 시크릿 없음 (YAML 확인)
- [x] 기존 `pull-request-lint`·`upgrade-develop` 동작·설정 유지 (diff 없음)
- [x] `develop`/`main`에 `Validate` required check ruleset 등록 ([rules/22869611](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/rules/22869611))
- [x] 샘플 PR로 초록 확인 ([#40](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/pull/40) `Validate` 4m19s pass). 의도적 breakage는 생략

## 범위 밖

- `pulumi preview` / 배포 / OIDC / 클라우드·Pulumi 시크릿
- turbo remote cache, path filter, affected-only (후속 최적화)
- Husky 훅 제거·완화 (로컬 DX는 유지. CI가 안전망)
- coverage 수치 강제
- infra 스택 live/e2e, Automation API 테스트

## 현재 조치

- `.projenrc.ts` `addPrValidationWorkflow()` — Node 24, pnpm 10.33.0, 한 job `Validate`, concurrency cancel-in-progress
- 생성물: `.github/workflows/pr-validation.yml` (+ `.projen/files.json` / `.gitattributes` / `.gitignore` linguist·negate)
- 로컬: `pnpm build:workspaces && pnpm test:workspaces && pnpm eslint` 통과 (2026-09-11)
- Ruleset: `PR validation required` — `main`/`develop`에 context `Validate` required. `do_not_enforce_on_create: true`, strict false ([rules/22869611](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/rules/22869611))
- [#40](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/pull/40) 머지됨 (`c39ae21`, 2026-09-11)

## 참고

- Gemini 원안: `tmp/gemini/ci-validation-pipeline.plan.md`
- 현재 PR 제목만: `.github/workflows/pull-request-lint.yml`
- upgrade가 이미 `pnpm build:workspaces` + frozen install 패턴 사용: `.github/workflows/upgrade-develop.yml`

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-11 | 등록. Gemini 제안 리뷰. 옵션 A 추천. 사용자 결정 5항 대기 |
| 2026-09-11 | 결정 5항 확정 (추천안). 상태 진행중. 구현 착수 |
| 2026-09-11 | `pr-validation.yml` 합성. 로컬 전량 통과. ruleset 22869611 등록. 상태 적용. 샘플 PR 검증·머지 남음 |
| 2026-09-11 | [#40](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/pull/40) 열어 원격 `Validate` 확인 중 |
| 2026-09-11 | `#40` `Validate` pass (4m19s). 제목 린트 pass. 머지 후 아카이브 |
| 2026-09-11 | `#40` 머지. 상태 해결. `docs/resolved` 아카이브 |
