---
root: false
targets:
  - '*'
description: GitOps 레포는 gitignore된 로컬 클론 repos/gitops. 별도 레포, main push = 즉시 배포, commit·push는 사용자 요청 시만
globs: []
cursor:
  alwaysApply: true
  description: GitOps 레포는 gitignore된 로컬 클론 repos/gitops. 별도 레포, main push = 즉시 배포, commit·push는 사용자 요청 시만
  globs: []
---

# GitOps 레포 (`repos/gitops`)

Argo CD 소스 레포 `ApexCaptain.IaC.GitOps`는 submodule이 아니라 gitignore된 로컬 클론 `repos/gitops/`에 둔다. `pnpm script:bootstrapLocalEnv`(devcontainer 동기화 시 자동)가 clone·`pull --ff-only` 한다.

- **별도 레포다.** 이 레포 git(status·commit·PR)에 섞지 않는다. 명령은 `git -C repos/gitops ...`.
- Argo CD는 `main` HEAD를 본다. **`main` push = 즉시 배포.** commit·push는 사용자 요청 시만.
- 작업 전 `git -C repos/gitops pull --rebase origin main`. CI가 `main`에 직접 push할 수 있다.
- 환경 값·시크릿은 GitOps에 넣지 않는다. IaC(Pulumi)가 주입한다.
- `scripts/hooks/gitops-git-guard.sh`(PreToolUse)가 commit/push 시 behind면 거부, push는 확인을 받는다. hook SSOT는 `.rulesync/hooks.jsonc`.
- IaC와 GitOps를 함께 바꾸면 원자적이지 않다. 반영 순서(Pulumi 먼저 / GitOps 먼저)를 사용자에게 알린다.
