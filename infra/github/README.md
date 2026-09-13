# @infra/github

ApexCaptain GitHub 레포 카탈로그 Pulumi 스택.

## 역할

- GitHub 레포 정체성(description, topics, visibility)과, IaC 레포의 ruleset·Issue 라벨·Actions secret을 IaC로 관리
- `ApexCaptain.IaC.Pulumi`는 이미 있으므로 `github.Repository` + `retainOnDelete` — stack destroy로 GitHub 레포를 지우지 않음
- `ApexCaptain.IaC.GitOps`는 이 스택이 생성. `protect: true` — Pulumi가 GitHub에서 삭제하지 않음
- ruleset·Actions secret은 Pulumi가 생성·삭제 (`deleteBeforeReplace`). Issue 라벨은 `github.IssueLabels`가 IaC 레포 목록 전체 SSOT
- 워크플로 YAML·PR 템플릿은 Projen SSOT. 이 스택에 두지 않음
- `githubContract.output.repositories.*` — `name`, `sshCloneUrl`. `@infra/k8s-workstation-system`이 GitOps를 참조

## Pulumi 프로젝트

| 항목 | 값 |
|------|-----|
| 프로젝트 | `github` |
| 기본 스택 | `prod` (`PULUMI_STACK`) |
| ESC | `githubEsc`, `commonEsc` |

레포 이름·Actions secret 값은 `githubEsc` (`apexCaptain.repositories.apexCaptainIacPulumi.name`, `apexCaptain.repositories.apexCaptainIacGitOps.name`, `apexCaptain.actions.*`). 토큰 값은 README에 적지 않음.

## 현재 레포

| 레포 | 관리 |
|------|------|
| `ApexCaptain.IaC.Pulumi` | Repository 형상, ruleset 2개, Issue 라벨 13개(GitHub 기본 9 + `chore`/`breaking`/`dependencies`/`security`), Actions secret 2개 (`PULUMI_ACCESS_TOKEN`, `WORKFLOW_TOKEN`) |
| `ApexCaptain.IaC.GitOps` | Repository 형상(`protect`). Argo CD 소스. deploy key·webhook은 system 스택이 붙임 |

Ruleset (`ApexCaptain.IaC.Pulumi`만):

| 이름 | 대상 | 내용 |
|------|------|------|
| `PR validation required` | `main`, `develop` | required check `Validate` (`doNotEnforceOnCreate`) |
| `Protect main and develop from deletion` | `main`, `develop` | 브랜치 삭제 금지 |

`ApexCaptain.IaC.Pulumi`의 `has_wiki`는 켜져 있고 Wiki 페이지는 없음. 문서 SSOT는 레포 `docs/`.

## 구조

```
src/
├── contract.ts                         # githubContract
└── components/
    ├── ApexCaptain.IaC.Pulumi/
    │   └── ApexCaptain.IaC.Pulumi.repository.component.ts
    └── ApexCaptain.IaC.GitOps/
        └── ApexCaptain.IaC.GitOps.repository.component.ts
```

## 의존성

- `@common/nexus`, `@common/utils`
- `@pulumi/github`

## 명령

```bash
pnpm --filter @infra/github build
pnpm --filter @infra/github eslint
pnpm --filter @infra/github pulumi:preview
pnpm --filter @infra/github pulumi:up
```

## 배포 순서

GitOps `sshCloneUrl`을 system이 쓰므로 **github → k8s-workstation-system**. Cloudflare와는 무관, 병렬 가능.

## downstream

- `@infra/k8s-workstation-system`
