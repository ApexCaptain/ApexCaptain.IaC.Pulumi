# @common/bridged-provider

Pulumi 공식 프로바이더가 없는 서비스(Authentik, ArgoCD, Coderd)를 위해 Terraform 프로바이더를 브릿징한 Pulumi SDK를 재노출하는 패키지.

## 역할

- `sdks/authentik`, `sdks/argocd`, `sdks/coderd`에 생성된 Pulumi 프로바이더 SDK를 `@pulumi/authentik`, `@pulumi/argocd`, `@pulumi/coderd` 이름으로 재노출한다.
- 각 서비스 리소스를 다른 workspace 패키지(`infra/*`)에서 네임스페이스(`authentik.*`, `argocd.*`, `coderd.*`) 형태로 import해 사용할 수 있게 한다.

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
