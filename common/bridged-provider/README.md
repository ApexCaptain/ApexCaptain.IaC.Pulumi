# @common/bridged-provider

모노레포에서 사용하는 Authentik·Argo CD·Coder용 Pulumi 브리지드 프로바이더 SDK를 `file:sdks/*`로 묶어 단일 패키지로 재노출한다.

`sdks/`는 `pulumi install` 생성물이며 git에 올리지 않는다. 클론·삭제 후에는 `pnpm pulumi:install`을 `pnpm i`보다 먼저 실행한다.

## 역할

- 워크스페이스 내부에 벤더링된 `@pulumi/authentik`, `@pulumi/argocd`, `@pulumi/coderd`를 `src/index.ts`에서 네임스페이스로 통합 export한다.
- infra·common 패키지가 동일한 SDK 경로와 버전을 공유하도록 의존성 진입점을 제공한다.

## 구조

```
src/
└── index.ts
sdks/          # gitignored — pnpm pulumi:install
Pulumi.yaml    # packages 선언 (tracked)
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
pnpm pulumi:install
pnpm --filter @common/bridged-provider build
pnpm --filter @common/bridged-provider eslint
pnpm --filter @common/bridged-provider test
```
