# @common/utils

Pulumi 기반 IaC 모노레포에서 공통으로 쓰는 설정, 타입, 유틸 함수·테스트 헬퍼를 모아 둔 라이브러리입니다.

## 역할

- 인프라·공통 패키지에서 재사용하는 Helm·컨테이너·도구 버전 등 중앙 설정(`configs`)을 제공합니다.
- 스택 단계·상태 리소스 옵션 등 Pulumi 스택 공통 규약을 코드로 고정합니다.
- 컴포넌트 정의, Cloudflare FQDN·OCI 정책 문구·Argo CD policy CSV 등 인프라 작성 시 반복되는 로직을 함수로 제공합니다.
- `kubeconfig` 등 공통 인터페이스와 Pulumi 입력용 깊은 partial 타입을 export합니다.
- 단위 테스트용 Pulumi mock·shim(`testing`)을 포함합니다.

## 구조

```
src/
└── configs/
└──   index.ts
└──   stack-stage-fallback.config.ts
└──   stateful-resource-options.config.ts
└──   versions.config.ts
└── enums/
└──   index.ts
└──   stack-stage.enum.ts
└── functions/
└──   create-argo-cd-policy-csv.function.ts
└──   create-expiration-interval.function.ts
└──   create-oci-policy-statement.function.ts
└──   define-component.function.ts
└──   index.ts
└──   is-valid-file-mode-string.function.ts
└──   kebab-case.function.ts
└──   merge-customizer.function.ts
└──   to-cloudflare-record-fqdn.function.ts
└──   wait-for-ms.function.ts
└── index.ts
└── interfaces/
└──   index.ts
└──   kubeconfig.interface.ts
└── testing/
└──   flat.shim.ts
└──   index.ts
└──   pulumi-mocks.ts
└── types/
└──   deep-partial.type.ts
└──   deep-pulumi-input.type.ts
└──   index.ts
```

## 의존성

- `@pulumi/pulumi` (^3.242.0)
- `dedent` (^1.7.2)
- `lodash` (^4.18.1)
- `yaml` (^2.8.3)
- `zod` (^4.6.7)

## 명령

```bash
pnpm --filter @common/utils build
pnpm --filter @common/utils eslint
pnpm --filter @common/utils test
```

## 참조

- `@common/nexus`, `@common/custom-resources`, `@common/bridged-provider`, `@infra/*` 등 workspace 패키지가 이 라이브러리를 의존합니다.
