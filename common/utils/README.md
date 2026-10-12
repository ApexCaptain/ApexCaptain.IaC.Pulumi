# @common/utils

Pulumi 기반 인프라 코드 전반에서 재사용하는 공통 설정·enum·함수·인터페이스·타입을 모아둔 유틸리티 패키지.

## 역할

- `configs`: 스택 스테이지(stage) 판별이 실패했을 때 사용할 fallback 설정을 제공한다.
- `enums`: 스택 스테이지(`StackStage`) 등 공통 enum을 정의한다.
- `functions`: Argo CD RBAC 정책 CSV 생성, OCI 정책 statement 생성, 만료 기간 계산, Cloudflare 레코드 FQDN 변환, kebab-case 변환, lodash merge customizer, 파일 모드 문자열 검증, Pulumi 컴포넌트 정의(`define-component`), 비동기 대기(`wait-for-ms`) 등 범용 헬퍼 함수를 제공한다.
- `interfaces`: `kubeconfig` 등 여러 패키지에서 공유하는 타입 인터페이스를 정의한다.
- `types`: `DeepPartial`, `DeepPulumiInput` 등 Pulumi 리소스 입력 타입을 다루기 위한 유틸리티 타입을 정의한다.

## 구조

```
src/
└── configs/
└──   index.ts
└──   stack-stage-fallback.config.ts
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
- `zod` (^4.4.3)

## 명령

```bash
pnpm --filter @common/utils build
pnpm --filter @common/utils eslint
pnpm --filter @common/utils test
```
