# @common/bridged-provider

로컬 `sdks/`에 두는 Pulumi bridged Provider SDK(Authentik, Argo CD, Coder)를 workspace 패키지 하나로 묶어 재내보내는 공통 모듈이다.

## 역할

- npm 레지스트리가 아닌 `file:sdks/*` 형태로 관리하는 Provider SDK를 `@common/bridged-provider` 아래 네임스페이스로 통일한다.
- infra·common 패키지에서 Provider별 import 경로를 한곳으로 모아 의존성과 버전 정책을 맞춘다.
- `authentik`, `argocd`, `coderd` 서브 모듈로 각 Provider 리소스 타입·Provider 클래스에 접근한다.

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
