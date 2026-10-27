# @common/nexus

Pulumi ESC 환경과 스택 간 contract를 타입·모듈로 묶어 infra 패키지가 공통으로 쓰는 설정 허브.

## 역할

- Pulumi ESC SDK를 감싸 스택별 ESC 정의(`cloudflare`, `k8s-workstation-*`, `oci`, `github`, `common`)를 한 패키지에서 관리함.
- `abstract`·`classes`로 ESC 접근 패턴과 contract 클래스를 제공해 infra 코드의 env·시크릿 검증을 일관되게 함.
- `@common/utils`, `@common/custom-resources`와 함께 모노레포 IaC 레이어의 설정·리소스 추상화를 담당함.

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

## 참조

- `src/esc/`에 정의된 ESC 모듈은 동명 `@infra/*` 스택 및 Cloudflare·OCI·GitHub 연동 설정과 대응함.
- 운영·품질 관련 문서: [Jest 유닛 테스트 도입](../../docs/issues/resolved/2026-09-21-nexus-jest-unit-tests.md), [오류 처리·env 검증 강화](../../docs/issues/resolved/2026-10-17-nexus-error-handling-hardening.md).
