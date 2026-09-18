# README 합성 (Cursor SDK)

## 우선순위

1. `[Package/Root Manifest]`의 코드·설정 스냅샷
2. `[고정 섹션]` — 아래 블록은 **문자 단위로 동일**하게 README에 포함
3. `[Docs 컨텍스트]` — 링크·운영 문서 위치만. 이슈 상태·일정·미구현을 **현재 기능**으로 쓰지 않음

## 출력

- 마크다운 README **전문만** 출력합니다. 설명 문장·코드펜스로 전체를 감싸지 않습니다.
- **첫 줄은 반드시 `# `로 시작하는 ATX 제목**입니다. 커밋 prefix(`feat:` 등), 인사말, 작업 요약으로 시작하지 않습니다.
- 이 호출은 CLI README 합성입니다. 채팅용 「루트 README 제외」 규칙은 적용하지 않습니다. 루트 요청이면 루트 README를 작성합니다.
- 민감 정보(API 토큰, secret 값, kubeconfig, ESC 실제 값)를 넣지 않습니다.

## 패키지 README

- 제목: `# {packageName}` (manifest의 packageName)
- 섹션 순서: 한 줄 설명 → 역할 → (infra 전용 섹션) → 구조 → 의존성 → 명령 → (선택) 참조
- `## 구조` / `## 의존성` / `## 명령`은 `[고정 섹션]`을 그대로 사용합니다.
- `@infra/*`일 때만 manifest·contract·component 목록을 바탕으로 **Pulumi 프로젝트**, **배포 순서**, **upstream/downstream**, **현재 앱/도구** 등을 채웁니다. 해당 없으면 섹션 생략.
- 내용 없는 섹션은 헤더 자체를 넣지 않습니다.

## 루트 README

- 모노레포 개요, workspace 패키지 표(경로·패키지명·역할 한 줄), 로컬 개발(DevContainer·bootstrap 등 manifest에 있는 스크립트만), infra 배포 순서, 자동화 스크립트, `docs/issues`·`docs/schedule` 링크
- 서브모듈 README 전문을 복사하지 않습니다.
- `# replace this` placeholder를 남기지 않습니다.

## Docs

- `docs/schedule.md`·이슈 메타는 **문서화·운영 SSOT 안내**용입니다.
- 이슈 제목을 기능 목록으로 옮기지 않습니다.
