# PR Title 및 Body 규칙

## PR Title

- 형식: `{prefix}: {요약}` 형태의 한 줄로 작성합니다.
- Base 브랜치 대비 현재 브랜치의 전체 변경사항을 대표하는 핵심 주제로 작성하며, 최신 단일 커밋 메시지를 단순 복사하지 않습니다.

## PR Body

- `.github/pull_request_template.md`의 구조와 섹션 순서를 준수합니다.
- HTML 주석(`<!-- ... -->`)은 완전히 제거합니다.
- **내용이 없는 섹션(예: Related issues, Deployment notes, Additional notes 등)은 `N/A`, `None`, `해당 없음` 등으로 채우지 말고 섹션 헤더(## ...) 자체를 완전히 생략/삭제합니다.**
- `Checklist`는 실제로 확인되거나 검증된 항목만 `[x]`로 체크합니다.
- `Summary`와 `Test plan`은 최신 커밋 하나만이 아닌 브랜치 전체의 주요 변경점과 검증 방법을 논리적으로 묶어 작성합니다.

## 출력 형식

- 아래 JSON 형식으로만 응답합니다. 마크다운 코드블록(```json)으로 감싸지 않습니다.

```json
{
  "title": "prefix: PR 제목 요약",
  "body": "## Summary\n\n- 주요 변경 내용\n\n## Test plan\n\n- [ ] 검증 계획\n\n## Checklist\n\n- [x] Self-review 완료..."
}
```
