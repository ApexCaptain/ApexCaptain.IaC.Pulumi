# @infra/github

ApexCaptain GitHub 레포 카탈로그 Pulumi 스택.

## 역할

- GitHub 레포 형상(description, topics, merge 정책)과 ruleset, Actions secret을 IaC로 관리
- 이 모노레포 `ApexCaptain.IaC.Pulumi`는 이미 있으므로 `github.Repository` + `retainOnDelete` — stack destroy로 GitHub 레포를 지우지 않음
- ruleset·Actions secret은 Pulumi가 생성·삭제 (`deleteBeforeReplace`)
- 워크플로 YAML·PR 템플릿은 Projen SSOT. 이 스택에 두지 않음
- `GithubContract.output.repositories.iacPulumi` — `name`, `sshCloneUrl`만. 다른 infra 스택은 이 contract를 참조하지 않음

## Pulumi 프로젝트

| 항목 | 값 |
|------|-----|
| 프로젝트 | `github` |
| 기본 스택 | `prod` (`PULUMI_STACK`) |
| ESC | `githubEsc`, `commonEsc` |

레포 이름·Actions secret 값은 `githubEsc` (`apexCaptain.repositories.iacPulumi.name`, `apexCaptain.actions.*`). 토큰 값은 README에 적지 않음.

## 현재 레포

| 레포 | 관리 |
|------|------|
| `ApexCaptain.IaC.Pulumi` | Repository 형상, ruleset 2개, Actions secret 2개 (`PULUMI_ACCESS_TOKEN`, `WORKFLOW_TOKEN`) |

Ruleset:

| 이름 | 대상 | 내용 |
|------|------|------|
| `PR validation required` | `main`, `develop` | required check `Validate` (`doNotEnforceOnCreate`) |
| `Protect main and develop from deletion` | `main`, `develop` | 브랜치 삭제 금지 |

`has_wiki`는 켜져 있고 Wiki 페이지는 없음. 문서 SSOT는 레포 `docs/`.

## 구조

```
src/
├── contract.ts                         # GithubContract
└── components/
    └── ApexCaptain.IaC.Pulumi/
        └── ApexCaptain.IaC.Pulumi.repository.component.ts
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

k8s 스택과 무관. Cloudflare처럼 독립 배포 가능. `infraDeps` 없음.

Argo GitOps deploy key·webhook은 `@infra/k8s-workstation-system`이 GitHub provider로 붙인다.
