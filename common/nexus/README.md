# @common/nexus

스택 간 계약(Contract)과 Pulumi ESC 설정을 한곳에서 관리하는 코어 프레임워크.

## 역할

- **Contract** — Pulumi 스택의 `output`/`secret` export와 StackReference lazy 로딩
- **ESC** — 프로젝트별 환경 변수 스키마(zod) 및 typed accessor (`commonEsc`, `cloudflareEsc`, …)
- 스택 해시 파일 생성으로 contract 변경 추적

## 구조

```
src/
├── abstract/    # AbstractEsc
├── classes/     # Contract
└── esc/         # common, cloudflare, oci, k8s-workstation-* ESC
```

## Contract 사용 패턴

```ts
export const myContract = new nexus.classes.Contract(__filename, async () => ({
  output: pulumi.output({ /* 공개 값 */ }),
  secret: pulumi.secret({ /* 민감 값 */ }),
}));
```

다른 스택에서 import하면 StackReference로 자동 resolve됨.

## 의존성

- `@common/utils`, `@common/custom-resources`
- `@pulumi/pulumi`, `@pulumi/esc-sdk`, `@pulumi/std`

## 명령

```bash
pnpm --filter @common/nexus build
pnpm --filter @common/nexus eslint
```
