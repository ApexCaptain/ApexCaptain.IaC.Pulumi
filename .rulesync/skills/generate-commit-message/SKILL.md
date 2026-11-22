---
name: generate-commit-message
description: 커밋 메시지 생성 요청 시 staged/unstaged diff 검토 후 .github/generated/commit-message.txt에 작성한다. Use when the user asks for a commit message, commit-message.txt, "커밋 메시지 써줘", or asks to commit.
targets:
  - '*'
---

# 커밋 메시지 생성

**`git commit`은 사용자가 명시적으로 요청할 때만** 실행한다. 이때는 `pnpm git:commit`(= `git commit -F .github/generated/commit-message.txt`)을 쓴다. 흐름 전체는 `use-git-flow` 규칙.

> **범위:** 다음 커밋에 담을 staged/unstaged 변경만 요약한다. PR title·body는 `generate-pull-request` 스킬.

## 1. 변경 확인

**병렬** 실행:

- `git status`
- `git diff --stat` + `git diff --cached --stat`
- `git diff` + `git diff --cached` (크면 stat·파일 목록 우선, `common/bridged-provider/sdks/` 등 생성물은 본문 생략)
- `git log -5 --oneline` (문체 참고)

## 2. Secret 검사

아래가 보이면 **파일을 쓰지 않고** 경고한다.

- 파일: `.env*`, `credentials.json`, `*.pem`, `*.key`, `id_rsa` 등, `.secrets/`, `.keys/`, kubeconfig 원문
- 값: private key 블록, `ghp_`/`gho_` 토큰, `AKIA…`, Pulumi access token, stack config 평문 secret, password·client secret

## 3. 작성

`.github/generated/commit-message.txt`에만 쓴다 (디렉터리 없으면 생성).

### 제목

- `{prefix}: {요약}`. prefix는 아래만:
  - `feat` — 사용자·운영에 보이는 기능/인프라 리소스 추가·변경
  - `fix` — 버그, 오동작, 배포 실패 수정
  - `test` — 테스트 코드·검증 스크립트
  - `chore` — 빌드, CI, 의존성, 포맷, 문서 등 부수 작업
  - `dev` — 개발 환경, 로컬 워크플로, 개발 스크립트
- 50자 내외(최대 72자), 마침표 없음
- 여러 주제가 섞이면 가장 중요한 사용자·운영 영향을 제목에. 부수 작업(README, 진단 스냅샷, 포맷)은 억지로 나열하지 않는다
- 주제가 독립적으로 갈리면 커밋 분리를 사용자에게 제안한다

### 본문

- 제목만으로 Why가 충분하면 생략
- 필요하면 1~2문장, **Why** 중심, 완결된 문장

### 언어·문체

- 한국어. 기존 `git log`가 영어여도 한국어 (고유명사·CLI·설정 키·경로는 원문)
- "이 커밋은 ~합니다", "Generated with …" 같은 메타·AI 문구 금지
- 코드펜스 없이 원문만

채팅에는 제목·요약만 보여준다.

## 하지 않을 것

- 사용자 요청 없이 `git commit` / `git push`
- secret 의심 변경을 무시하고 작성
