# @infra/cloudflare

Workstation 클러스터용 Cloudflare DNS Pulumi 스택.

## 역할

- `ayteneve93.com` zone CNAME 레코드 관리
- `cloudflareContract.output.zones.ayteneve93com.records.*` — 다른 infra 스택에서 host 참조
- proxied 여부는 서비스별로 `records.workstation` 컴포넌트에서 설정

## Pulumi 프로젝트

| 항목 | 값 |
|------|-----|
| 프로젝트 | `Pulumi.yaml` name 필드 참조 |
| 기본 스택 | `prod` (`PULUMI_STACK`) |
| ESC | `cloudflareEsc`, `commonEsc` |

## 구조

```
src/
├── contract.ts              # cloudflareContract
└── components/
    └── records/             # RecordsWorkstationComponent
```

## 의존성

- `@common/nexus`, `@common/utils`
- `@pulumi/cloudflare`

## 명령

```bash
pnpm --filter @infra/cloudflare build
pnpm --filter @infra/cloudflare pulumi:preview
pnpm --filter @infra/cloudflare pulumi:up
```

## 배포 순서

DNS는 system/apps/tools보다 **먼저** 올려도 되고, 레코드만 추가할 때는 독립 배포 가능.

## downstream

- `@infra/k8s-workstation-system`
- `@infra/k8s-workstation-apps`
- `@infra/k8s-workstation-tools`
