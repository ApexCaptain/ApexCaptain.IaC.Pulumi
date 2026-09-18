# @common/utils

모노레포 전역에서 공통으로 쓰는 설정값·enum·유틸리티 함수·타입·인터페이스 모음.

## 역할

- `configs`: 스택/스테이지 판별이 실패했을 때 사용할 fallback 설정값을 제공.
- `enums`: 스택 스테이지(`StackStageEnum` 등) 값을 정의.
- `functions`: Argo CD 정책 CSV 생성, OCI 정책 statement 생성, 만료 interval 계산, kebab-case 변환, Cloudflare 레코드 FQDN 변환, 커스텀 머지, 컴포넌트 정의(`defineComponent`) 등 여러 패키지에서 공유하는 순수 함수를 제공.
- `interfaces`: `Kubeconfig` 등 여러 패키지에서 재사용하는 타입 인터페이스를 정의.
- `types`: `DeepPartial`, `DeepPulumiInput` 등 Pulumi 리소스 타입 조작에 쓰는 유틸리티 타입을 정의.

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
