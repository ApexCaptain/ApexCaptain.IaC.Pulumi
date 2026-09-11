# Projen 합성에서 런타임 부작용 분리 (오프라인 멱등)

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-11 |
| **영역** | 루트 Projen (`.projenrc.ts`) · `scripts/` · DevContainer sync |
| **관련 코드** | `.projenrc.ts` (`initPulumiEsc`, Ventoy Handlebars, `rootProject.postSynthesize`) · `.devcontainer/commands/common/synchronizeProject.sh` · `common/nexus/src/esc/` · `ventoy/templates/` |
| **상태** | **적용** — Tasks 1–5 완료. 수용 기준 충족 (아카이브는 사용자 확인 후) |
| **선행** | 없음 |
| **후속** | [projenrc 모듈화](2026-09-11-projenrc-modularize.md) (이 이슈 머지 후) |
| **참고** | Gemini 초안 `tmp/gemini/Refactor .projenrc.ts & Decouple Side Effects Plan.md` (모듈화·스크립트명은 본 이슈에서 수정 반영) |

## 배경

`.projenrc.ts`(~1650줄)에 형상 선언과 런타임 부작용이 한 파일에 묶여 있다.

- `initPulumiEsc()` — DNS lookup, NordVPN API, Pulumi ESC upsert (Cloudflare/OCI/GitHub/워크스테이션 등)
- Ventoy — Handlebars 템플릿 컴파일, sha512 password hash, `workstation-node.yaml` 쓰기
- `postSynthesize` — `git submodule update`, `pip install`, SSH/OCI 키 `chmod`

대부분 `src.constants.isDevContainer` 가드 안이라 CI의 `pnpm exec projen`은 네트워크를 거의 안 탄다. 문제는 DevContainer에서 `synchronizeProject.sh` → `pnpm projen` 경로가 ESC/Ventoy를 **합성의 일부**로 돌린다는 점이다. env 누락·네트워크 단절 시 합성이 실패하고, Projen SSOT와 프로비저닝이 섞인다.

## 문제

1. `pnpm exec projen`이 순수 합성이 아님 (DevContainer에서 외부 API·시크릿·DNS 의존)
2. Ventoy password hash가 합성마다 `randomBytes` salt로 바뀔 수 있음 (의도치 않은 drift)
3. 후속 모듈화(이슈 2) 전에 부작용을 빼지 않으면 생성물 diff·회귀 검증이 어려움

## 현재 상태

- ESC upsert → `scripts/sync-pulumi-esc.script.ts` (`script:syncPulumiEsc`)
- Ventoy user-data → `scripts/generate-ventoy-user-data.script.ts` (`script:generateVentoyUserData`)
- submodule/pip → `scripts/bootstrap-local-env.script.ts` (`script:bootstrapLocalEnv`)
- `postSynthesize`는 DevContainer에서 `chmod`만
- `synchronizeProject.sh`가 `pnpm projen` 직후 위 세 스크립트 호출
- `projenrc/` 모듈화는 후속 이슈 (미착수)

## 목표

- `pnpm exec projen`은 **네트워크·시크릿 없이** 예외 없이 완료
- ESC sync / Ventoy build / (submodule·pip)는 독립 `scripts/*.script.ts` + `pnpm script:*`
- DevContainer UX는 유지: sync 스크립트가 projen 다음에 부작용 스크립트를 호출
- 기존 `pnpm build*` / `test*` / `eslint` / `pulumi:*` 인터페이스·Turbo/pnpm workspace 토폴로지 불변
- Projen SSOT 유지 (`package.json`·워크플로 YAML 손수정 금지)

## 접근 비교

| 방식 | 요지 | 장단 |
|---|---|---|
| **A. 스크립트만 분리** | ESC·Ventoy만 `scripts/`로. sync 배선 없음 | 회귀 (온보딩에서 ESC/user-data 안 생김) |
| **B. 분리 + synchronizeProject 배선** | 분리 후 `pnpm projen` 다음에 sync/build 호출 | 현행 UX 유지. 합성은 순수 |
| **C. Projen Task에만 넣기** | 부작용을 Projen task로만 노출 | 가능하나 기존 `scripts/*.script.ts` 패턴과 불일치 |

## 추천

**B.**

세부 결정:

| 항목 | 결정 |
|---|---|
| 스크립트 이름 | `script:syncPulumiEsc`, `script:generateVentoyUserData`, `script:bootstrapLocalEnv` (기존 `script:*` 톤) |
| ESC | upsert 로직만 이관. 스택 `esc: [NexusEsc.*]` 스키마 참조는 `.projenrc` 잔류 |
| Ventoy | `ventoy.json`은 정적 경로만 Projen `JsonFile`로 선언. yaml 생성은 스크립트 |
| postSynthesize | `git submodule` + `pip install` → `script:bootstrapLocalEnv`. **`chmod`는 postSynthesize 잔류** |
| sync 배선 | `.devcontainer/commands/common/synchronizeProject.sh`에서 `pnpm projen` 직후 세 스크립트 호출 (또는 bootstrap + esc + ventoy) |
| env | 스크립트 진입 시 필수 env 사전 검증. 실패 시 명확한 메시지 후 non-zero exit |

## 수용 기준

- [x] `pnpm exec projen`이 DevContainer·비-DevContainer 모두에서 외부 네트워크 호출 없이 완료 (ESC/NordVPN/DNS/axios 없음)
- [x] `rootProject.addScripts`에 `script:syncPulumiEsc`, `script:generateVentoyUserData`, `script:bootstrapLocalEnv` 등록
- [x] `synchronizeProject.sh`가 `pnpm projen` 이후 위 스크립트를 호출해 기존 온보딩 효과 유지
- [x] `postSynthesize`에 `chmod`만 남고 submodule/pip는 없음
- [x] `pnpm build:workspaces` · `pnpm test:workspaces` · `pnpm eslint` 통과
- [x] 주요 스크립트 인터페이스(`pulumi:preview`, `pulumi:up`, `build:workspaces` 등) 이름·의미 유지
- [x] 구현 후 생성 파일에 **의도치 않은** 동작 변경 없음 (워크플로·turbo 토폴로지 불변)

## 범위 밖

- `projenrc/`로의 워크플로·프로젝트 팩토리 모듈화 → [후속 이슈](2026-09-11-projenrc-modularize.md)
- ESC 스키마/AbstractEsc 리팩터
- Ventoy 템플릿 내용·ISO 경로 변경
- CI에 ESC sync 추가 (시크릿·네트워크 필요. 의도적으로 제외)

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-11 | 등록. 설계 승인 (이슈 분리 C, 접근 B). 구현 플랜 작성 |
| 2026-09-11 | Tasks 1–4 구현 (스크립트 3종·sync 배선·postSynthesize chmod만). Task 5 검증: `pnpm exec projen`·build/test/eslint 전부 exit 0 |
