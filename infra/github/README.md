# @infra/github

ApexCaptain GitHub 계정의 IaC·GitOps 레포지터리 정체성을 Pulumi 한 스택에서 관리한다.

## 역할

- GitHub 레포 카탈로그를 단일 contract(`githubContract`)로 정의하고, 레포 메타·보호 정책·Actions 시크릿을 코드로 유지한다.
- **ApexCaptain.IaC.Pulumi** 레포는 이미 존재하는 전제로 `retainOnDelete`를 적용해 스택 destroy 시 GitHub에서 삭제되지 않게 한다.
- **ApexCaptain.IaC.GitOps** 레포는 스택이 생성하며 `protect`로 Pulumi가 GitHub에서 삭제하지 못하게 한다.
- GitOps의 `name`·`sshCloneUrl`은 `@infra/k8s-workstation-system`이 참조하며, deploy key·webhook은 해당 스택에서 연결한다.

## Pulumi 프로젝트

- Pulumi ESC: `nexus.esc.githubEsc`(ApexCaptain owner·token, 레포 이름, Actions 시크릿 등).
- GitHub Provider는 ESC의 `apexCaptain.owner`·`apexCaptain.token`으로 구성한다.

## 현재 앱/도구

| 컴포넌트 | 대상 | 동작 |
| --- | --- | --- |
| `ApexCaptainIaCPulumiRepositoryComponent` | IaC(Pulumi) 레포 | 레포 정체성·Actions 시크릿(`pulumiAccessToken`, `workflowToken`) |
| `ApexCaptainIaCGitOpsRepositoryComponent` | GitOps 레포 | 레포 생성·보호(`protect`) |

## 배포 순서

- `@infra/k8s-workstation-system`이 GitOps 레포 출력을 쓰므로, **GitHub 스택을 workstation-system보다 먼저** 배포·갱신한다.
- Cloudflare·Kubernetes 스택 체인(`cloudflare → k8s-workstation-system → apps/tools`)과 병행 가능하나, Argo CD·GitOps 연동 전에 본 스택 출력이 있어야 한다.

## upstream / downstream

| 방향 | 패키지 | 관계 |
| --- | --- | --- |
| downstream | `@infra/k8s-workstation-system` | GitOps 레포 `name`·`sshCloneUrl` 등 contract 출력 참조 |
| upstream | — | 별도 infra 스택 의존 없음(GitHub·ESC만 사용) |

## 구조

```
src/
└── components/
└──   ApexCaptain.IaC.GitOps/
└──     ApexCaptain.IaC.GitOps.repository.component.ts
└──     index.ts
└──   ApexCaptain.IaC.Pulumi/
└──     ApexCaptain.IaC.Pulumi.repository.component.ts
└──     index.ts
└──   index.ts
└── contract.ts
└── index.ts
```

## 의존성

- `@common/nexus` (workspace:*)
- `@common/utils` (workspace:*)
- `@pulumi/github` (^6.14.0)
- `@pulumi/pulumi` (^3.261.0)
- `dedent` (^1.7.2)
- `lodash` (^4.18.1)
- `yaml` (^2.9.0)

## 명령

```bash
pnpm --filter @infra/github build
pnpm --filter @infra/github eslint
pnpm --filter @infra/github test
pnpm --filter @infra/github pulumi:preview
pnpm --filter @infra/github pulumi:up
```

## 관련 문서

- [Projen `CronScheduleOptions`에 GitHub Actions schedule timezone 타입 없음](docs/issues/resolved/2026-09-09-projen-workflow-schedule-timezone.md)
- [GitHub Wiki 관리 방식 — 보류, 나중에 결정](docs/issues/resolved/2026-09-10-github-wiki-management.md)
- [docs/issues → GitHub Issues 단방향 미러](docs/issues/resolved/2026-10-27-github-issues-mirror.md)
