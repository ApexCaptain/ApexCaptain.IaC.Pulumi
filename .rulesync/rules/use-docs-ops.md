---
root: false
targets:
  - '*'
description: '마감 없이 주기 반복하는 운영 루프는 docs/ops. 이슈(active)에 두지 않음'
globs: []
cursor:
  alwaysApply: true
  description: '마감 없이 주기 반복하는 운영 루프는 docs/ops. 이슈(active)에 두지 않음'
  globs: []
---
# 운영 루프 (`docs/ops/`)

**마감 조건 없이** 일정 주기(매월 등)로 무조건 반복하는 일은 이슈(`docs/issues/active`)가 아니다. `docs/ops/`에 등록하고, 언제 돌릴지만 `docs/schedule.md` 달력에 올린다.

| | 이슈 | ops |
|---|---|---|
| 성격 | 조사·버그·설계·일회 후속. 끝나면 `resolved` | 영구·주기 운영. 끝 없음 |
| 위치 | `docs/issues/active/` → `resolved/` | `docs/ops/<kebab-slug>.md` |
| schedule | 재검토·트리거 행. 해결 시 **삭제** | 다음 실행일 행. 돌린 뒤 **다음 날짜로 갱신** (삭제 금지) |

## 언제 ops인가

- 매월·분기 등 **주기만** 있고 “다 하면 닫는다”가 없음
- 같은 체크리스트를 반복 (예: VPA 갭 재분석 → IaC 패치)
- 반대로: 한 번 재검토 후 도입/폐기 결정, upstream 대기, 트리거 1회 → **이슈**

애매하면 이슈. ops는 반복이 이미 확정됐을 때만.

## 파일

`docs/ops/<kebab-slug>.md` (등록일 prefix 없음. slug만)

```markdown
# <한국어 제목>

| 항목 | 내용 |
|---|---|
| **주기** | 매월 초 / 분기 등 |
| **다음** | YYYY-MM … |
| **영역** | 대상 |
| **관련 코드** | 경로 (없으면 생략) |
| **이력** | 과거 이슈·결정 링크 (있으면) |

## 정책
## 체크리스트
## 실행 로그

| 일시 | 요약 |
|---|---|
| YYYY-MM-DD | … |
```

본문 한국어·평문. 시크릿 금지. 정책·체크리스트는 여기 SSOT. 긴 과거 스냅은 이슈 `resolved` 이력으로 두고 ops는 요약·로그 한 줄만.

## 실행 후

1. 체크리스트 수행·필요 시 IaC
2. **실행 로그** append
3. 메타 **다음**을 다음 주기로
4. `docs/schedule.md` 같은 행의 날짜·할 일을 맞춤 (행 삭제 금지)

## 이슈에서 이사

이미 `active`에 있던 주기 루프를 ops로 옮길 때:

1. `docs/ops/…`에 정책·체크리스트·다음 주기 작성
2. 이슈는 **해결** + 해결 요약에 ops 링크 → `docs/issues/resolved/` 이동 (이력 보존. md 삭제 금지 = GitHub 미러 삭제됨)
3. schedule 행 링크를 `ops/…`로 바꾸고 상태 칸을 `ops` 등으로. **행 유지**

## 하지 않을 것

- 마감 없는 반복을 `docs/issues/active`에 신규 등록
- ops를 이슈처럼 `resolved`로 “닫기”
- schedule에서 ops 행을 “이번 달 했다”고 삭제
- `docs/ops/` 밖에 운영 루프 SSOT를 두기
