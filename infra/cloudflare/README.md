# @infra/cloudflare

Workstation 클러스터용 Cloudflare DNS Pulumi 스택.

## 역할

- `ayteneve93.com` zone CNAME 레코드 관리
- `cloudflareContract.output.zones.ayteneve93com.records.*` — 다른 infra 스택에서 host 참조
- proxied 여부는 서비스별로 `Ayteneve93comRecordsComponent`에서 설정

## Pulumi 프로젝트

| 항목 | 값 |
|------|-----|
| 프로젝트 | `cloudflare` |
| 기본 스택 | `prod` (`PULUMI_STACK`) |
| ESC | `cloudflareEsc`, `commonEsc`, `githubEsc` |

## 현재 레코드

공통 타깃: `workstation` CNAME → iptime DDNS (`proxied: false`, LE DNS-01·L4 직접 접속).

| 호스트 | proxied | 용도 |
|--------|---------|------|
| `workstation` | false | DDNS apex, cert-manager DNS-01, SFTP L4 |
| `auth` | true | Authentik UI |
| `longhorn` | true | Longhorn UI |
| `torrent` | true | qBittorrent Web UI |
| `vault` | true | Vault API/UI |
| `grafana` | true | Grafana |
| `goldilocks` | true | Goldilocks dashboard |
| `argo-cd` | true | Argo CD |
| `test` | true | 테스트 |
| `jellyfin` | false | 스트리밍·대역폭 — CF proxy 우회 |
| `todo` | false | Vikunja |
| `coder` | false | Coder |
| `blog` | true | GitHub Pages (`{owner}.github.io`) |

## 구조

```
src/
├── contract.ts              # cloudflareContract
└── components/
    └── ayteneve93com/       # Ayteneve93comRecordsComponent
```

## 의존성

- `@common/nexus`, `@common/utils`
- `@pulumi/cloudflare`

## 명령

```bash
pnpm --filter @infra/cloudflare build
pnpm --filter @infra/cloudflare eslint
pnpm --filter @infra/cloudflare pulumi:preview
pnpm --filter @infra/cloudflare pulumi:up
```

## 배포 순서

DNS는 system/apps/tools보다 **먼저** 올려도 되고, 레코드만 추가할 때는 독립 배포 가능.

## downstream

- `@infra/k8s-workstation-system`
- `@infra/k8s-workstation-apps`
- `@infra/k8s-workstation-tools`
