---
name: generate-pull-request
description: PR title·body·labels 생성 요청 시 base 대비 브랜치 전체 diff를 검토해 .github/generated/pull-request-title.txt, pull-request-body.md, pull-request-labels.txt에 작성한다. 브랜치 이름 제안 포함. Use when the user asks for a PR body, pull request draft, "PR 올려줘", or a branch name.
targets:
  - '*'
---

# PR title·body·labels 생성

**`git push` / PR 생성은 사용자가 명시적으로 요청할 때만** 한다. PR 생성은 `pnpm git:pr`. 흐름 전체는 `use-git-flow` 규칙.

> **범위:** base 대비 현재 브랜치 **전체** 변경. 최신 커밋 하나나 작업 트리만 보고 쓰지 않는다.
> 커밋 메시지는 `generate-commit-message` 스킬. develop → main 승격은 `pnpm git:promote`가 문구까지 만든다 (이 스킬 불필요).

## 1. 브랜치

- base는 사용자가 명시하지 않으면 `develop`
- 현재 브랜치가 `develop`/`main`이고 PR을 원하면 feature 브랜치를 먼저 만든다 (`git switch -c <name>`). 사용자가 이름을 줬으면 그대로 쓴다
- 브랜치 이름: `{type}/{short-kebab-slug}`
  - type: `feat` | `fix` | `chore` | `docs` | `test` | `dev`
  - slug: 소문자·숫자·하이픈, 3~6단어, 변경 요지

## 2. 변경 확인

`git fetch origin` 후 **병렬**:

- `git status`, `git log -5 --oneline`
- `git log origin/<base>..HEAD --oneline` — PR에 실릴 모든 커밋
- `git diff --stat origin/<base>...HEAD`
- `git diff origin/<base>...HEAD` (크면 stat 우선, 생성물 본문 생략)

## 3. Secret 검사

`generate-commit-message` 스킬과 같은 기준. 이상 있으면 파일을 쓰지 않고 경고.

## 4. 작성

`.github/pull_request_template.md` 구조·순서를 따른다. 아래 세 파일만 쓴다 (디렉터리 없으면 생성).

| 파일 | 내용 |
|---|---|
| `.github/generated/pull-request-title.txt` | 한 줄. `{prefix}: {요약}` (prefix는 커밋 스킬과 동일) |
| `.github/generated/pull-request-body.md` | 템플릿 본문 |
| `.github/generated/pull-request-labels.txt` | 라벨 한 줄에 하나 (없으면 빈 파일) |

### Title

- 브랜치 전체를 대표하는 주제. 마지막 커밋 메시지 복사 금지

### Body

- HTML 주석 제거
- 내용 없는 섹션(Related issues, Deployment notes, Additional notes 등)은 `N/A`·`None`·`해당 없음`으로 채우지 말고 `##` 헤더째 삭제
- Summary·Test plan은 브랜치 전체를 묶어서. 항목마다 완결된 한국어 문장
- Checklist는 실제 확인한 항목만 `[x]`
- IaC 변경이면 내용 있을 때만 Deployment notes에 stack·배포 순서·수동 후속·롤백

### Labels

- `infra/github`의 `IAC_PULUMI_ISSUE_LABELS`에 있는 이름만. 새로 만들지 않는다
- 보통 1~2개: `feat` → `enhancement`, `fix` → `bug`, `chore`/`dev`/`test` → `chore`, 문서만 → `documentation`. 필요 시 `dependencies`·`security`·`breaking`
- 확신 없으면 빈 파일

### 문체

- 한국어. 메타·AI 문구("Generated with …" 등) 금지. 군더더기 없이

## 하지 않을 것

- 사용자 요청 없이 push / PR 생성
- `develop`을 head로 하는 PR을 이 스킬로 만들기 (승격은 `pnpm git:promote`)
