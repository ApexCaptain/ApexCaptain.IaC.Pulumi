# @common/bridged-provider

Terraform bridged provider SDK를 모노레포 workspace 패키지로 래핑.

## 역할

- Authentik, Argo CD, Coder 등 bridged provider를 로컬 `@pulumi/*` SDK로 vendoring
- `pulumi install` 대상 — 루트 `pnpm pulumi:install`로 SDK 빌드
- infra/common 패키지에서 `@common/bridged-provider` import로 re-export 사용

## 구조

```
src/
└── index.ts          # authentik, argocd, coderd re-export

sdks/
├── authentik/        # pulumi package gen (Terraform provider 기반)
├── argocd/
└── coderd/
```

## SDK 재생성

provider schema 변경 시 해당 `sdks/<provider>` 디렉터리를 갱신한 뒤:

```bash
pnpm pulumi:install   # 루트 package.json
pnpm --filter @common/bridged-provider build
```

## 의존성

- `@pulumi/authentik` (file:sdks/authentik)
- `@pulumi/argocd` (file:sdks/argocd)
- `@pulumi/coderd` (file:sdks/coderd)

## 명령

```bash
pnpm --filter @common/bridged-provider build
pnpm --filter @common/bridged-provider eslint
```
