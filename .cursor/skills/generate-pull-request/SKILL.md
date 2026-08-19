---
name: generate-pull-request
description: >-
  PR title·body 생성 요청 시 base branch 대비 diff를 바탕으로 Cursor SDK 스크립트를 실행하여
  .github/generated/pull-request-title.txt, pull-request-body.md에 작성한다.
  Use when the user asks for a PR body, pull request draft, or similar.
---

# PR Title 및 Body 생성 규칙

## 1. 언어 및 문체
- **언어:** 반드시 한국어로 작성합니다. Title과 Body 모두 한국어로 쓰며, 기존 `git log`가 영어여도 따르지 않습니다. (고유명사, CLI 명령어, 설정 키, 파일 경로는 원문 유지)
- **문체:** 간결한 문체 (~함 / 명사형 종결 혼용 가능, 경어체 불필요)

## 2. PR Title 규칙
- 형식: 반드시 `{prefix}: {요약}` 형태의 한 줄로 작성합니다.
- Prefix는 커밋 규칙과 동일하게 `feat`, `fix`, `test`, `chore`, `dev` 중 하나를 선택합니다.
- Base 브랜치 대비 현재 브랜치의 전체 변경사항을 대표하는 핵심 주제로 작성하며, 최신 단일 커밋 메시지를 단순 복사하지 않습니다.

## 3. PR Body 규칙
- `.github/pull_request_template.md`의 구조와 섹션 순서를 준수합니다.
- HTML 주석(`<!-- ... -->`)은 완전히 제거합니다.
- **내용이 없는 섹션(예: Related issues, Deployment notes, Additional notes 등)은 `N/A`, `None`, `해당 없음` 등으로 채우지 말고 섹션 헤더(## ...) 자체를 완전히 생략/삭제합니다.**
- `Checklist`는 실제로 확인되거나 검증된 항목만 `[x]`로 체크합니다.
- `Summary`와 `Test plan`은 최신 커밋 하나만이 아닌 브랜치 전체의 주요 변경점과 검증 방법을 논리적으로 묶어 작성합니다.
