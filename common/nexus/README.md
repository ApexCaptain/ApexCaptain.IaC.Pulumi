# @common/nexus

Pulumi ESC(Environments, Secrets, Configuration) 환경을 스택별로 정의하고 워크스페이스 전역에서 참조할 수 있도록 추상화한 공통 패키지.

## 역할

- `abstract/esc.abstract.ts`에서 ESC 환경이 공통으로 따라야 할 인터페이스를 정의한다.
- `esc/` 하위에 `cloudflare`, `github`, `oci`, `k8s-workstation-system`, `k8s-workstation-apps`, `k8s-workstation-tools` 등 스택별 ESC 환경 구현체를 둔다.
- `classes/contract.ts`가 각 ESC 환경을 하나의 contract로 묶어 다른 workspace 패키지가 import해 사용할 수 있게 노출한다.

## 구조

```
src/
└── abstract/
└──   esc.abstract.ts
└──   index.ts
└── classes/
└──   contract.ts
└──   index.ts
└── esc/
└──   cloudflare.esc.ts
└──   common.esc.ts
└──   github.esc.ts
└──   index.ts
└──   k8s-workstation-apps.esc.ts
└──   k8s-workstation-system.esc.ts
└──   k8s-workstation-tools.esc.ts
└──   oci.esc.ts
└── index.ts
```

## 의존성

- `@common/custom-resources` (workspace:*)
- `@common/utils` (workspace:*)
- `@pulumi/esc-sdk` (^0.13.1)
- `@pulumi/pulumi` (^3.242.0)
- `@pulumi/std` (^2.3.2)
- `dedent` (^1.7.2)
- `lodash` (^4.18.1)
- `yaml` (^2.8.3)
- `zod` (^4.4.3)

## 명령

```bash
pnpm --filter @common/nexus build
pnpm --filter @common/nexus eslint
pnpm --filter @common/nexus test
```
