# @common/bridged-provider

Pulumi SDK가 없는 외부 Terraform/Helm provider(Authentik, ArgoCD, Coderd)를 `sdks/` 하위에 생성된 Pulumi provider로 감싸 재노출하는 패키지.

## 역할

- `sdks/authentik`, `sdks/argocd`, `sdks/coderd`에 생성된 Pulumi provider SDK를 `index.ts`에서 각각 `authentik`, `argocd`, `coderd` 네임스페이스로 재노출함.
- 다른 workspace 패키지가 Terraform bridged provider를 직접 `file:` 경로로 참조하지 않고 `@common/bridged-provider`를 통해서만 의존하도록 함.

## 구조

```
src/
└── index.ts
```

## 의존성

- `@pulumi/argocd` (file:sdks/argocd)
- `@pulumi/authentik` (file:sdks/authentik)
- `@pulumi/coderd` (file:sdks/coderd)
- `@pulumi/pulumi` (^3.242.0)
- `dedent` (^1.7.2)
- `lodash` (^4.18.1)
- `yaml` (^2.8.3)

## 명령

```bash
pnpm --filter @common/bridged-provider build
pnpm --filter @common/bridged-provider eslint
pnpm --filter @common/bridged-provider test
```
