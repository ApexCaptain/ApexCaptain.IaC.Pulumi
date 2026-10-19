# @infra/github

ApexCaptain GitHub 계정의 IaC·GitOps 레포지토리 정체성을 Pulumi 한 스택에서 관리한다.

## 역할

- `ApexCaptain.IaC.Pulumi` 레포는 이미 존재하는 리소스로 등록하며, 스택 destroy 시 GitHub에서 삭제되지 않도록 `retainOnDelete`를 적용한다.
- `ApexCaptain.IaC.GitOps` 레포는 이 스택이 생성하며 `protect`로 Pulumi가 GitHub에서 삭제하지 않도록 한다.
- Actions용 시크릿(예: Pulumi access token, workflow token)은 IaC Pulumi 레포 컴포넌트에서 ESC 값을 참조해 설정한다.
- 스택 출력으로 각 레포의 메타데이터(`name`, clone URL 등)를 노출하며, GitOps 쪽 deploy key·webhook은 `@infra/k8s-workstation-system`에서 붙인다.

## Pulumi 프로젝트

- GitHub Provider·레포 이름·토큰 등은 `@common/nexus`의 GitHub ESC(`githubEsc`)에서 읽는다.
- 스택 출력: `repositories.apexCaptainIacPulumi`, `repositories.apexCaptainIacGitOps`.

## 현재 레포

| 컴포넌트 | 대상 | 패턴 |
| -------- | ---- | ---- |
| `ApexCaptain.IaC.Pulumi` | IaC Pulumi 레포 | `retainOnDelete`, Actions secrets |
| `ApexCaptain.IaC.GitOps` | GitOps 레포 | 스택 생성, `protect` |

## 배포 순서

- `@infra/k8s-workstation-system`이 GitOps 레포 `name`·`sshCloneUrl`을 참조하므로, 해당 스택보다 **먼저** 배포한다.
- Cloudflare·K8s 워크스테이션 스택과 직렬 의존은 없으나, GitOps 연동을 위해 워크스테이션 system 스택 전에 적용하는 것이 안전하다.

## upstream / downstream

| 방향 | 패키지 | 내용 |
| ---- | ------ | ---- |
| downstream | `@infra/k8s-workstation-system` | GitOps 레포 출력(`name`, `sshCloneUrl` 등) 참조, deploy key·webhook 설정 |

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
