# GitOps 레포를 submodule 대신 gitignore 로컬 클론으로 관리

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-21 |
| **영역** | 개발 환경 (devcontainer bootstrap, AI 에이전트 hooks) |
| **관련 코드** | `scripts/bootstrap-local-env.script.ts`, `scripts/hooks/gitops-git-guard.sh`, `.rulesync/hooks.jsonc`, `.rulesync/rules/use-gitops-repo.md`, `.projenrc.ts` (gitignore·rulesync targets) |
| **상태** | **적용** — CI 이미지 태그 자동 push 연결 후 hook behind 검사 실검증 남음 |

## 배경

IaC와 Argo CD 소스 레포 `ApexCaptain.IaC.GitOps`를 한 작업공간에서 다루고 싶다. 참고 구현(jisung-it.dev-infra.iac)은 gitops를 git submodule로 넣고, Jenkins `main` 직접 push 때문에 생기는 포인터 drift를 guard hook·pre-push 스크립트로 메운다.

## 접근 비교

| 방식 | 장점 | 단점 |
|------|------|------|
| git submodule | 커밋 고정·재현성 (이론상) | Argo는 `main` HEAD를 봐서 포인터가 배포와 무관. CI push마다 drift, bump 커밋 잡음 |
| gitignore 로컬 클론 | 한 작업공간 유지, 포인터 없음, 실패해도 부트스트랩 안 막힘 | 클론 최신화는 스크립트·pull 의존 |
| 레포 합치기 | 원자적 변경 | CI가 IaC 레포 쓰기 권한 필요, 이력 오염 |

**추천·결정:** gitignore 로컬 클론 (`repos/gitops`). guard hook도 지금 넣는다 — 추후 CI가 GitOps `main`에 태그를 push할 예정.

## 현재 상태

- `pnpm script:bootstrapLocalEnv`가 clone(없으면) 또는 `pull --ff-only`(로컬 변경 없음·`main`·원격 브랜치 있음일 때만). 실패는 경고만.
- `gitops-git-guard.sh` (Claude Code PreToolUse / Cursor beforeShellExecution): `repos/gitops` commit/push 시 `origin/main`보다 behind면 deny, push는 ask. 빈 레포·오프라인이면 behind 검사만 건너뛰고 push ask 유지.
- 2026-10-21 기준 GitOps 레포는 빈 레포(커밋 0).

## 수용 기준

- [x] `repos/` gitignore, `.claude/settings.json`·`.cursor/hooks.json` 생성물 gitignore
- [x] bootstrap clone·재실행 시 빈 레포 경고
- [x] hook: push ask, commit allow, behind deny (로컬 bare 레포로 시뮬레이션)
- [ ] CI 자동 push 연결 후 실제 behind deny 확인

## 범위 밖

- CI(이미지 빌드 → GitOps 태그 갱신) 파이프라인 자체 — 별도 이슈.

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-21 | 등록. 로컬 클론·bootstrap·guard hook·rule 적용 |
