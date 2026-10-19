# @common/utils

Pulumi 기반 IaC 모노레포에서 공통으로 쓰는 설정, 타입, 유틸 함수를 모아 둔 패키지다.

## 역할

- 스택 단계(`StackStage`)·버전·stateful 리소스 보호 옵션(`statefulResourceOptions`) 등 **공통 설정**을 `configs`와 `enums`로 제공한다.
- Pulumi 컴포넌트 정의(`defineComponent`), lodash 병합 커스터마이저, kebab-case 변환 등 **컴포넌트·리소스 작성 보조** 함수를 제공한다.
- Cloudflare DNS FQDN, OCI 정책 문구, Argo CD 정책 CSV, 만료 간격 생성 등 **인프라 연동용 헬퍼**를 제공한다.
- `DeepPartial`, `DeepPulumiInput`, `Kubeconfig` 등 **타입·인터페이스**로 스택 코드의 입력 모델을 맞춘다.

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
