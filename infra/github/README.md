# @infra/github

ApexCaptain GitHub 계정의 레포 카탈로그를 관리하는 Pulumi 스택.

## 역할

- ApexCaptain 계정 소유 레포의 정체성(이름, GitHub Provider, Actions secrets 등)을 한 스택에서 관리한다.
- `ApexCaptain.IaC.Pulumi` 레포는 이 IaC 레포 자신이며 이미 존재하므로 `retainOnDelete`로 관리해 destroy 시에도 GitHub에서 지우지 않는다.
- `ApexCaptain.IaC.GitOps` 레포는 이 스택이 직접 생성하며 `protect`로 보호해 Pulumi가 GitHub에서 삭제하지 않는다.

## 관리 대상 레포

| 컴포넌트 | 레포 | 특징 |
| --- | --- | --- |
| `ApexCaptainIaCPulumiRepositoryComponent` | `ApexCaptain.IaC.Pulumi` | 기존 레포, `retainOnDelete`, Actions secrets(`pulumiAccessToken`, `workflowToken`) 설정 |
| `ApexCaptainIaCGitOpsRepositoryComponent` | `ApexCaptain.IaC.GitOps` | 이 스택이 생성, `protect` |

## downstream

- `@infra/k8s-workstation-system`이 `ApexCaptain.IaC.GitOps` 레포의 `name`/`sshCloneUrl`을 참조한다. deploy key·webhook 연결은 해당 스택에서 처리한다.

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
