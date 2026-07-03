# @common/utils

Pulumi IaC 모노레포 전역에서 쓰는 공통 유틸·타입·헬퍼.

## 역할

- `defineComponent` — 컴포넌트 `output`/`secret` 패턴 표준화
- `DeepPulumiInput` 등 Pulumi args 타입 유틸
- `StackStage` enum, stack stage fallback 설정
- kebab-case, OCI policy statement 등 범용 함수

## 구조

```
src/
├── configs/     # stack stage fallback
├── enums/       # StackStage
├── functions/   # defineComponent, kebabCase, …
├── interfaces/  # kubeconfig 등
└── types/       # DeepPartial, DeepPulumiInput
```

## 의존성

- `@pulumi/pulumi`, `lodash`, `yaml`, `zod`

## 명령

```bash
pnpm --filter @common/utils build
pnpm --filter @common/utils eslint
```

## 참조

모든 `common/*`, `infra/*` 패키지가 workspace 의존성으로 참조함.
