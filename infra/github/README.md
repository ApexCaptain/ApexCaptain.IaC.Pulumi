# @infra/github

ApexCaptain 계정의 GitHub 레포 카탈로그를 한 스택에서 관리하는 Pulumi 프로젝트.

## 역할

- `ApexCaptain.IaC.Pulumi`, `ApexCaptain.IaC.GitOps` 두 레포의 정체성을 코드로 관리한다.
- IaC(Pulumi) 레포는 이미 존재하는 레포이므로 `retainOnDelete`로 관리해 destroy 시에도 GitHub에서 삭제하지 않는다.
- GitOps 레포는 이 스택이 직접 생성하며 `protect`를 적용해 Pulumi가 실수로 삭제하지 못하게 한다.
- `apexCaptainGithubProvider` 하나를 두 레포 컴포넌트가 공유하며, 인증 정보는 `nexus.esc.githubEsc`에서 가져온다.
- GitOps 레포의 `name`/`sshCloneUrl`은 `@infra/k8s-workstation-system`이 참조하며, deploy key·webhook 연결은 해당 스택 쪽에서 수행한다.

## upstream / downstream

- upstream 의존 스택 없음 — 독립적으로 배포 가능하다.
- downstream: `@infra/k8s-workstation-system`이 이 스택의 `output.repositories.apexCaptainIacGitOps`(`name`, `sshCloneUrl`)를 참조한다.

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
