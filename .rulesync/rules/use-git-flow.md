---
root: false
targets:
  - '*'
description: 'develop은 직접 push 또는 PR, main은 pnpm git:promote PR로만. PR은 auto-merge 워크플로가 체크 통과 후 머지. 커밋·push·PR은 사용자 요청 시에만'
globs: []
cursor:
  alwaysApply: true
  description: 'develop은 직접 push 또는 PR, main은 pnpm git:promote PR로만. PR은 auto-merge 워크플로가 체크 통과 후 머지. 커밋·push·PR은 사용자 요청 시에만'
  globs: []
---

# Git 흐름

브랜치 보호의 SSOT는 IaC다 (`infra/github`의 ruleset). 로컬 husky 훅은 빨리 실패시키는 용도일 뿐이다.

| 브랜치 | 들어가는 방법 | 보호 (ruleset) |
|---|---|---|
| `develop` | 직접 push 허용. feature 브랜치 → PR도 가능 | 삭제·force-push 금지 |
| `main` | `pnpm git:promote`로 develop → main PR (head=`develop`)만 | PR 필수 + `Validate` 필수 + 삭제·force-push 금지 |

- develop·main 대상 PR은 `auto-merge` 워크플로(SSOT `projenrc/workflows/auto-merge.ts`)가 `Validate`·`Validate PR title` 통과 뒤 **merge commit**으로 머지한다. native auto-merge(`gh pr merge --auto`)는 쓰지 않는다
- develop→main 머지 후 head(`develop`) 자동 삭제는 ruleset `deletion`이 막는다
- develop 직접 push는 PR 검증(`Validate`)을 거치지 않는다. 로컬 `pre-push`가 `pnpm test:workspaces`만 돌린다
- 커밋·PR 제목 prefix는 `test`·`feat`·`fix`·`chore`·`dev`만 (`pull-request-lint`가 PR 제목 검사)
- `git commit`·`git push`·PR 생성은 **사용자가 요청할 때만** 한다

## 명령

| 작업 | 문구 생성 | 실행 |
|---|---|---|
| 커밋 | `generate-commit-message` 스킬 → `.github/generated/commit-message.txt` | `pnpm git:commit` |
| feature PR (base develop) | `generate-pull-request` 스킬 → `.github/generated/pull-request-{title.txt,body.md,labels.txt}` | `pnpm git:pr` (현재 브랜치 push 후 `gh pr create`) |
| develop → main 승격 | 불필요 (스크립트가 커밋 목록으로 작성) | `pnpm git:promote` |

- `pnpm git:pr --base <b> --head <h>`처럼 `--` 없이 인자를 준다
- `.husky/post-commit`은 feature 브랜치 커밋 시 자동 push 한다 (develop·main은 안 함)
- 훅 SSOT는 `.projenrc.ts`의 `generateHuskyHooks`. `.husky/*` 직접 수정 금지
