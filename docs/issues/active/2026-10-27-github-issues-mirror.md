# docs/issues → GitHub Issues 단방향 미러

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-27 |
| **영역** | 레포 문서 (`docs/`), GitHub Issues, CI |
| **관련 코드** | `docs/issues/active/`, `docs/issues/resolved/`, `docs/schedule.md`, `.rulesync/rules/use-docs-issues.md`, `.projenrc.ts` (workflow 생성), `scripts/` |
| **상태** | **진행중** — 스크립트·workflow 구현. develop 머지 후 첫 전체 동기화 대기 |

## 배경

이슈 SSOT는 레포 안 마크다운(`docs/issues/active` → `docs/issues/resolved`)이다. 에이전트가 오프라인으로 읽고, 이슈 갱신이 코드와 같은 PR에 탄다. 이 장점은 유지한다.

GitHub Issues에 미러하면 얻는 것: 커밋·PR에서 `#N` 참조, 모바일·알림, Projects 보드, 레포 밖에서 열린 작업 확인.

## 결정

- **SSOT는 레포 안 md.** GitHub Issue는 읽기용 미러.
- **단방향만.** GitHub 웹에서 고친 본문·라벨·상태는 다음 싱크에 덮어쓴다. md로 역쓰기하지 않는다.
- 양방향은 하지 않는다: SSOT 이중화, 충돌 규칙 필요, 역쓰기 봇이 PR 필수 ruleset(`main`/`develop`)에 막힘, 타임라인 append-only 강제 불가.

## 설계안

| 항목 | 방식 |
|---|---|
| 트리거 | `develop` push, 경로 `docs/issues/**`. 수동 `workflow_dispatch`(전체 재싱크) |
| 매핑 | Issue 본문 첫 줄 숨김 마커 `<!-- docs-issue: <파일명 slug> -->`. md에 Issue 번호를 쓰지 않음 |
| 생성·갱신 | `docs/issues/active/<f>.md` 존재 → open 상태로 본문 덮어씀. 제목은 md `#` 제목 |
| 종료 | 같은 slug가 `docs/issues/resolved/`로 이동 → close (`state_reason: completed`) |
| 삭제 | md가 양쪽 다 없음 → close (`not_planned`) + 라벨 `docs:removed`. Issue 삭제하지 않음 |
| 본문 상단 | "SSOT: `<경로 링크>`. 여기서 수정 금지" 배너 |
| 라벨 | 메타 `상태`(조사중/진행중/완화/적용/보류) → `status:*`. `영역`은 자유 텍스트라 일단 매핑 안 함 |
| 상대 링크 | md 안 상대 링크를 blob URL로 변환 |
| 댓글 | 동기화 대상 아님. 필요하면 lock |
| 일정 | `docs/schedule.md`는 미러하지 않음. milestone 안 씀 |

구현 형태: `scripts/sync-github-issues.script.ts` + projen이 생성하는 workflow 하나. 토큰은 workflow 기본 `GITHUB_TOKEN`(`issues: write`)으로 충분한지 먼저 확인.

## 확인할 것

- 레포 공개 여부와 이슈 문서 내용 — 공개 Issue로 나가면 안 되는 내용(내부 호스트명·IP 등)이 있는지 기존 파일 점검
- 기존 GitHub Issue(수동 생성분)와 번호·라벨 충돌
- `GITHUB_TOKEN` 권한으로 생성한 Issue는 다른 workflow를 트리거하지 않음 — 문제 없는지

## 수용 기준

- [x] 공개 노출 점검 완료 (필요 시 마스킹 규칙 또는 미러 제외 목록) — 2026-10-27, 시크릿 없음. 노드 공인 IP 1건은 허용
- [x] 스크립트: 로컬 dry-run으로 생성·갱신·close 계획 출력
- [x] workflow: `.projenrc.ts`에서 생성, `develop` push 시 실행
- [ ] 재실행해도 결과 동일 (idempotent), 중복 Issue 없음
- [ ] `docs/issues/resolved` 이동 시 Issue close 확인
- [x] `use-docs-issues` 룰에 "GitHub Issue는 미러, 수정은 md" 한 줄 추가

## 범위 밖

- GitHub → md 역동기화
- Wiki 미러 ([GitHub Wiki 관리](2026-09-10-github-wiki-management.md)에서 별도 결정. 같은 단방향 패턴 재사용 가능)
- Projects 보드 자동 구성

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-27 | 등록. SSOT는 md, GitHub Issue는 단방향 미러로 방향 확정. 구현 보류 |
| 2026-10-27 | 공개 노출 점검 (`docs/` 현재 파일 + git 히스토리). 토큰·키·비밀번호 없음. `resolved/2026-09-18-opentelemetry-operator-crashloop.md`의 노드 공인 IP는 사용자 판단으로 그대로 둠 |
| 2026-10-27 | 이슈 디렉터리 재구성(`docs/issues/active`·`docs/issues/resolved`)에 맞춰 경로 갱신. 미러 트리거 경로는 `docs/issues/**` 하나로 충분 |
| 2026-10-27 | 결정: resolved도 미러(closed로 생성), 트리거 `develop`, 댓글 열어둠. 구현 — `scripts/common/docs-issue-mirror.ts`(순수 로직)·`.test.ts`(node:test 15개), `scripts/sync-github-issues.script.ts`(기본 dry-run, `--apply`), `projenrc/workflows/docs-issue-mirror.ts`, `pnpm test:scripts`를 pr-validation에 추가. 로컬 dry-run: md 49개 → create 49 |
