# @common/nexus Jest 유닛 테스트 도입

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-21 |
| **해결일** | 2026-09-21 |
| **영역** | `@common/nexus`, `.projenrc.ts` |
| **관련 코드** | `common/nexus/src/classes/contract.ts`, `common/nexus/src/abstract/esc.abstract.ts`, `common/nexus/test/` |
| **상태** | **해결** — Jest·Contract·AbstractEsc 유닛 테스트 도입. 이 레포에서 할 일 없음 |
| **선행** | [Jest 유닛 테스트 도입](../resolved/2026-09-08-jest-unit-test-setup.md) (해결 — utils·custom-resources만; nexus는 `jest: false`로 남음) |
| **원안** | `tmp/gemini/nexus_test_coverage_implementation_plan.md` |

## 해결 요약

Projen `jest: true`로 `@common/nexus`에 Jest 배선. `Contract`(Pulumi.yaml·동일 스택·StackReference·prod fallback)와 `AbstractEsc.upsertEsc`(merge+Zod / invalid) 유닛 테스트 8개. `src` 변경 없음. `pnpm test:workspaces` 통과.

## 배경

`@common/utils`·`@common/custom-resources`는 Projen `jest: true`와 유닛 테스트가 있다. 스택 간 Contract·ESC 허브인 `@common/nexus`는 `test/tsconfig.json`만 있고 Jest 러너·테스트 파일이 없다. 회귀 비용이 큰 경로가 무방비다.

## 문제

- `.projenrc.ts` nexus 블록에 `jest: true` 없음 → `projen test`가 eslint만 수행
- `Contract` (Pulumi.yaml 탐색, StackReference, inflate/hash)와 `AbstractEsc.upsertEsc` (머지·Zod) 단위 검증 없음

## 목표

선행 Jest 이슈와 같은 패턴으로 nexus에만 Jest opt-in. 프로덕션 `src` 변경 없음(테스트 가능하게 만들기 위한 최소 리팩터만 허용; 기본은 characterization).

## 접근 비교

| 방식 | 요지 | 단점 |
|---|---|---|
| **A. Projen opt-in + 패키지 내 테스트** | `inflateCommonProject({ jest: true })`, `test/*.test.ts`, custom-resources와 동일 harness | mock 복제. 단기 허용 |
| B. custom-resources mock을 공유 패키지로 승격 | DRY | 범위 확대. 이번 이슈 밖 |
| C. 손수 jest.config | Projen 우회 | synth와 충돌 |

**추천:** A. mock 공유는 후속.

## 계획

### Spec 1 — Jest 배선

1. `.projenrc.ts` nexus에 `jest: true`
2. `pnpm exec projen` → `jest.config.json`, deps, scripts
3. Quality gate: `pnpm --filter @common/nexus test` (passWithNoTests)

### Spec 2 — Pulumi mock + Contract

1. `common/nexus/test/pulumi-mocks.ts` — `installPulumiMocks` / `unwrap` 이식. StackReference·TextFile·`std.md5` call 추적
2. `contract.test.ts` — tmp fixture(`Pulumi.yaml` + stage yaml)
   - Pulumi.yaml 미발견 / name 없음 → Error
   - 동일 프로젝트: inflate + hash TextFile 생성
   - 타 프로젝트: StackReference id `${org}/${project}/${stage}` (+ fallback 스모크 1건)
3. `resolveReferencedStackStage` 전체 재검증은 utils 테스트에 맡김

### Spec 3 — AbstractEsc

1. `esc.test.ts` — 테스트용 작은 Zod 스키마 서브클래스
2. `defaultSecret` + `stageSecrets` deep merge(배열 uniq/sort) 후 `safeParse` 통과
3. 잘못된 값 → Zod validation Error
4. `EscApi`는 mock (`createEnvironment` / `updateEnvironment`). live ESC 호출 없음
5. `mergeCustomizer` 단독·`esc` getter(`requireSecretObject`)는 범위 밖(전자는 utils, 후자는 Config mock 별도)

## 수용 기준

- [x] `common/nexus/jest.config.json` 존재, package.json에 jest/ts-jest
- [x] `pnpm --filter @common/nexus test` 통과
- [x] Contract: 탐색 실패 / 동일 스택 / StackReference 경로 커버
- [x] AbstractEsc: merge+valid / invalid Zod 커버
- [x] `pnpm test:workspaces` 통과
- [x] 프로덕션 `common/nexus/src` 불필요 변경 없음 (또는 이슈에 명시)

## 구현 요약

| 경로 | 역할 |
|---|---|
| `.projenrc.ts` | nexus `jest: true` |
| `common/nexus/test/pulumi-mocks.ts` | `installPulumiMocks` / `unwrap`. org·md5 call |
| `common/nexus/test/contract.test.ts` | Pulumi.yaml 실패·동일 스택·StackReference·prod fallback. `jest.mock('flat')` |
| `common/nexus/test/esc.test.ts` | 작은 Zod 서브클래스. merge+update / invalid / `getEscNameWithStage` |

`src` 변경 없음. 2 suite / 8 test.

## 범위 밖

- mock harness를 공유 패키지로 승격
- 개별 `*.esc.ts` 스키마 전수 valid fixture
- infra 스택 `contract.ts` thin wrapper 테스트
- coverage 수치 강제, GHA 전용 잡 추가

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-21 | 등록. Gemini 안 반영·선행 Jest 이슈 후속으로 분리. 구현 착수 |
| 2026-09-21 | Spec 1–3 구현. nexus 8 test·`test:workspaces` 통과. 상태 **적용** |
| 2026-09-21 | 사용자 닫기. `docs/resolved`로 이동 |
