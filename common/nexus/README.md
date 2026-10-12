# @common/nexus

Pulumi ESC(Environments, Secrets, and Configuration) 환경을 패키지별로 타입 세이프하게 정의하고 조회하는 공통 모듈.

## 역할

- `EscAbstract`를 기반으로 각 Pulumi 프로젝트(`cloudflare`, `github`, `oci`, `k8s-workstation-system`, `k8s-workstation-apps`, `k8s-workstation-tools`, `common`)별 ESC 환경의 org/project/env 이름과 spec 타입을 정의한다.
- `Contract`가 `@pulumi/esc-sdk`의 `EscClient`를 생성하고, 각 ESC 클래스를 인스턴스화해 `contract.esc.<name>` 형태로 노출한다.
- 다른 `@common/*`, `@infra/*` 패키지는 이 `Contract`를 통해 Pulumi ESC에 저장된 시크릿·설정 값을 타입 세이프하게 조회한다.

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
