# @common/utils

Pulumi IaC 모노레포 전역에서 쓰는 공통 유틸·타입·헬퍼.

## 역할

- `defineComponent` — 컴포넌트 `output`/`secret` 패턴 표준화
- `DeepPulumiInput`, `DeepPartial` 등 Pulumi args 타입 유틸
- `StackStage` enum, `resolveReferencedStackStage` fallback (`dev` → `prod`)
- kebab-case, OCI policy statement, Argo CD policy CSV, Cloudflare FQDN, file mode 검증, wait/merge/expiration 헬퍼

## 구조

```
src/
├── configs/     # stack stage fallback
├── enums/       # StackStage
├── functions/   # defineComponent, kebabCase, toCloudflareRecordFqdn, …
├── interfaces/  # kubeconfig
└── types/       # DeepPartial, DeepPulumiInput
```

## 의존성

- `@pulumi/pulumi`, `lodash`, `yaml`, `zod`, `dedent`

## 명령

```bash
pnpm --filter @common/utils build
pnpm --filter @common/utils eslint
pnpm --filter @common/utils test
```

## 참조

`@common/nexus`, `@common/custom-resources`, 모든 `@infra/*` 패키지가 workspace 의존성으로 참조함. `@common/bridged-provider`는 미참조.
