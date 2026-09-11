# `.projenrc.ts` 모듈화 (`projenrc/` 하위 분리)

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-11 |
| **영역** | 루트 Projen 엔트리 · `projenrc/` |
| **관련 코드** | `.projenrc.ts` · `projenrc/tsconfig.json` · `projenrc/workflows/*` · `projenrc/projects/*` |
| **상태** | **적용** — 모듈 분리 완료. resolve는 부작용 분리와 일괄 후속 |
| **선행** | [2026-09-11-projen-decouple-side-effects](2026-09-11-projen-decouple-side-effects.md) |
| **구현 플랜** | `docs/superpowers/plans/2026-09-11-projenrc-modularize.md` |
| **참고** | Gemini Phase 3. **200줄 KPI는 채택하지 않음** |

## 배경

부작용을 뺀 뒤에도 `.projenrc.ts`에 워크플로 팩토리·common/pulumi 프로젝트 빌더·루트 옵션·파일 선언이 한 파일에 남는다. `projenrc/tsconfig.json`은 이미 `projenrc/**/*.ts`를 전제로 하나 모듈 파일은 없다.

## 문제

- 합성 로직 탐색·리뷰 비용이 큼
- 워크플로 변경과 프로젝트 그래프 변경이 같은 파일에서 섞임
- 부작용 분리와 동시에 모듈화하면 생성물 diff 원인 분리가 어려움

## 현재 상태

- `modifyUpgradeWorkflow` · `addPrValidationWorkflow` · `inflateCommonProject` · `inflatePulumiProject` 가 `.projenrc.ts`에 인라인
- `projenrc/` = tsconfig만

## 목표

- 워크플로·프로젝트 빌더를 `projenrc/` 모듈로 이동
- `.projenrc.ts`는 공유 옵션 + 팩토리 호출 오케스트레이션
- **생성 파일 byte-수준 동작 동일** (`pnpm exec projen` 후 의도된 diff 없음)
- 줄 수 KPI 없음 (오케스트레이션이 500~800이어도 동작 동일하면 성공)

## 접근 비교

| 방식 | 요지 | 장단 |
|---|---|---|
| **A. 워크플로만** | `workflows/*.ts`만 | 이득 작음 |
| **B. 워크플로 + 프로젝트 빌더** | Gemini Phase 3 뼈대, 줄 수 KPI 없음 | 가독성↑, 검증 가능 |
| **C. 전면 도메인 쪼개기** | 키 파일·ansible·스크립트 등록까지 전부 모듈 | 과분할. 이번 범위 밖 |

## 추천

**B.** 대상 파일:

- `projenrc/workflows/upgrade.ts` — `modifyUpgradeWorkflow`
- `projenrc/workflows/pr-validation.ts` — `addPrValidationWorkflow`
- `projenrc/projects/common-projects.ts` — `inflateCommonProject` + common 인스턴스화에 필요한 헬퍼
- `projenrc/projects/pulumi-projects.ts` — `inflatePulumiProject` + 스택 빌더에 필요한 헬퍼

루트의 `sharedProjectOption` · `rootProject` 생성 · TextFile/JsonFile/키·스크립트 `addScripts`는 엔트리에 남겨도 된다. 옮기면 순환 의존만 늘 수 있음.

## 수용 기준

- [x] 선행 이슈(부작용 분리)가 `docs/resolved`이거나 수용 기준 충족 (PR #41 머지, 적용 상태. resolve는 후속 일괄)
- [x] 위 네 모듈 파일이 존재하고 `.projenrc.ts`가 이를 import해 호출
- [x] `pnpm exec projen` 후 `.projen/` · `.github/workflows/` · 워크스페이스 `package.json` 등 생성물에 **의도치 않은 diff 없음** (`git diff --exit-code`로 검증 가능한 범위)
- [x] `pnpm build:workspaces` · `pnpm test:workspaces` · `pnpm eslint` 통과
- [x] Turbo/pnpm workspace 패키지 목록·필터 불변

## 범위 밖

- 부작용 스크립트 추가 분리 (선행 이슈)
- ESC 스키마·인프라 스택 코드 리팩터
- “엔트리 N줄 이하” 강제
- DevContainer / sync 스크립트 추가 변경 (선행에서 끝난 상태 유지)

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-11 | 등록. 선행=부작용 분리. 설계 승인(B). 착수는 선행 완료 후 |
| 2026-09-11 | PR #41 머지 후 착수. workflows·projects 모듈 분리. synth/build/test/eslint 통과. resolve 보류 |
