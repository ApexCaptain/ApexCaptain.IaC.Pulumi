# @common/nexus

Pulumi ESC 환경 정의와 스택 간 contract 타입을 모노레포 전역에서 공유하는 공통 패키지이다.

## 역할

- 스택별 Pulumi ESC 구성(`cloudflare`, `github`, `oci`, `k8s-workstation-*` 등)을 `esc` 모듈로 모아 두고, infra·도구 코드에서 동일한 스키마로 참조한다.
- ESC 로딩·검증 패턴을 `abstract`에 두어 스택마다 중복 구현을 줄인다.
- `classes`의 contract 정의로 upstream·downstream 스택 간 Output·설정 교환 형식을 맞춘다.
- `@common/utils`, `@common/custom-resources`와 함께 IaC 코드베이스의 설정·시크릿 계층을 담당한다.

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
- `zod` (^4.6.7)

## 명령

```bash
pnpm --filter @common/nexus build
pnpm --filter @common/nexus eslint
pnpm --filter @common/nexus test
```

## 참조

- `@infra/*` 및 워크스페이스 내 Pulumi 스택 코드가 `esc`·`classes` export를 import해 ESC 이름과 contract 타입을 맞춘다.
- 운영·품질 관련 이슈 메모: [Jest 유닛 테스트 도입](docs/issues/resolved/2026-09-21-nexus-jest-unit-tests.md), [오류 처리·env 검증 강화](docs/issues/resolved/2026-10-17-nexus-error-handling-hardening.md).
