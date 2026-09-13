# gitflow 자동화 (Husky · PR 스크립트)

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-09-12 |
| **영역** | Husky, Projen 훅, `scripts/` PR·브랜치 DX, GitHub ruleset 연계 |
| **관련 코드** | `.projenrc.ts` (`generateHuskyHooks`), `scripts/open-pull-request.script.ts`, `scripts/promote-develop-to-main.script.ts`, `scripts/prompts/branch-name/` |
| **상태** | **진행중** — [#47](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/pull/47) Validate·머지 대기 |

## 배경

`main`/`develop`에 required `Validate` + 삭제 금지 ruleset이 생긴 뒤, 예전 Husky `post-commit: git push` 전제(보호 브랜치 직푸시)가 깨졌다. 일상 흐름은 feat → develop → main PR이다.

## 목표

| 단계 | 내용 |
|------|------|
| **1** | Husky를 gitflow에 맞춤. 보호 브랜치에서 자동 push 실패 제거 |
| **2** | 로컬=빠른 게이트, CI=`Validate`가 전량 진실. pre-push에 보호 브랜치 차단 |
| **3** | AI가 브랜치 이름 제안. `openPullRequest` / `promoteDevelopToMain`로 PR까지 |

## 결정

| # | 항목 | 결정 |
|---|------|------|
| 1 | `post-commit` | `main`/`develop`이면 push skip + 안내. 그 외 `git push -u origin HEAD` |
| 2 | `pre-push` | remote가 `main`/`develop`이면 exit 1. 아니면 기존 `test:workspaces` |
| 3 | `pre-commit` | lint-staged 유지 |
| 4 | husky → PR | 하지 않음. PR은 명시 스크립트만 |
| 5 | 브랜치 이름 | AI `type/kebab`. 사용자/`FEATURE_BRANCH_NAME` 우선 |
| 6 | 일상 PR base | **`develop`** |
| 7 | develop→main | 별도 `promoteDevelopToMain`. 삭제 금지는 ruleset |
| 8 | SSOT | `.projenrc.ts` / `scripts/`만. `.husky/*` 손수정 금지 |

## 수용 기준

- [x] `main`/`develop`에서 커밋해도 post-commit이 GH013으로 실패하지 않음
- [x] feature 브랜치 커밋 후 post-commit이 `git push -u` 시도
- [x] `git push origin develop`이 pre-push에서 로컬 차단
- [x] `pnpm script:openPullRequest`가 (필요 시) 브랜치 생성 → push → PR(base develop)
- [x] `pnpm script:promoteDevelopToMain`이 develop→main PR 생성
- [x] 이슈·schedule 반영

## 사용법

```bash
# 일상: feature에서 작업 후
pnpm script:generateCommitMessage && pnpm git:commit   # 또는 일반 commit
pnpm script:openPullRequest                            # push + develop PR
# (보호 브랜치에 있으면 AI가 type/kebab 브랜치 만들고 tip 복구)

# 동기화
pnpm script:promoteDevelopToMain                       # develop → main PR
```

## 범위 밖

- Husky 패키지 `prepare` 정식화
- turbo affected-only CI
- develop→main 자동 머지 봇

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-09-12 | 등록. 1~3단계·AI 브랜치명 방향 확정. 구현 착수 |
| 2026-09-12 | Husky 보호 브랜치 가드, `openPullRequest` / `promoteDevelopToMain`, `git:pr` base=develop 적용 |
| 2026-09-12 | [#47](https://github.com/ApexCaptain/ApexCaptain.IaC.Pulumi/pull/47) 오픈 (chore/gitflow-automation → develop) |