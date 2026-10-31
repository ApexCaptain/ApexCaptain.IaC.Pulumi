# @infra/k8s-workstation-tools

워크스테이션 Kubernetes 클러스터에 Coder·qBittorrent·Vikunja·Zero Trust 등 운영 도구를 배포하는 Pulumi infra 패키지.

## 역할

- `@infra/k8s-workstation-system` 위에서 동작하는 **도구(tools)** 스택을 정의한다.
- qBittorrent 등 일부 워크로드는 **NordLynx VPN sidecar**로 클러스터 밖 터널 경로만 사용하도록 구성한다.
- qBittorrent Web UI는 Longhorn과 동일하게 **Authentik Proxy + OutpostProviderAttachment** 패턴, Coder·Vikunja는 Authentik **OIDC**로 인증한다.
- **Zero Trust**: Cloudflare WARP + cloudflared + Authentik OIDC/MFA로 LAN 대상(Windows RDP)에 공인 inbound 포트 없이 접근하게 한다.
- `pulumi.getStack()`이 `prod`일 때만 Coder·Vikunja·qBittorrent·Zero Trust 리소스를 생성한다.

## Pulumi 프로젝트

- **스택:** `prod` (도구 컴포넌트는 production 스택에서만 프로비저닝)
- **ESC:** `nexus.esc.commonEsc`(kubeconfig, `workstationMainPcIp` 등), `nexus.esc.cloudflareEsc`(API 토큰·zone, `zeroTrust.allowedEmails`), `nexus.esc.k8sWorkstationToolsEsc`
- **Provider:** Kubernetes, Authentik·Vault(system contract `providerConfigs`), Cloudflare(Zero Trust, PROD 블록 안에서만 생성)

## 배포 순서

1. `@infra/cloudflare`
2. `@infra/k8s-workstation-system`
3. `@infra/k8s-workstation-tools` (본 패키지)

## upstream / downstream

| 방향 | 패키지 | 용도 |
|------|--------|------|
| upstream | `@infra/cloudflare` | DNS 호스트(`coder`, `todo`, `torrent`, `auth`), zone 도메인(`windows` FQDN 구성) |
| upstream | `@infra/k8s-workstation-system` | kubeconfig, Authentik·Vault provider, Longhorn SSD, Istio·Authentik 그룹/플로우 |
| downstream | (없음) | contract `output`/`secret`은 스택 내부·연동용 |

## 현재 앱/도구

| 컴포넌트 | 개요 | 저장·DB | 인증 | 메시/노출 |
|----------|------|---------|------|-----------|
| **coder** | 원격 개발(Coder Helm). 운영 워크스페이스는 Kata NS(`coder-kata-ubuntu` / `-test`, Istio sidecar). Sysbox NS(`coder-sysbox-ubuntu` / `-test`, Mesh Proxy)는 잔존 | PostgreSQL 클러스터(Longhorn SSD PVC) | Authentik OIDC, GitHub external auth | Istio AuthorizationPolicy, ingress `coder` 호스트 |
| **vikunja** | 할 일(Vikunja Helm) | CNPG PostgreSQL(Longhorn SSD) + data PVC, pCloud 백업 | Authentik OIDC(`toolsUserGroup`) | ambient mesh, `todo` 호스트 |
| **qbittorrent** | BitTorrent 클라이언트 | Longhorn SSD/HDD PVC, pCloud 백업 | Authentik Proxy(`toolsManagerGroup`) | service-mesh, NordLynx sidecar, SFTP(direct gateway) |
| **zero-trust** | Cloudflare Zero Trust — WARP로 LAN Windows RDP(`windows` FQDN) 접근 | 무상태 (cloudflared 2 replica) | Authentik OIDC + MFA(`toolsManagerGroup`), Cloudflare 허용 이메일 | mesh 밖 `zero-trust` ns, outbound 터널만. Gateway DNS override + L4 allow/block, Split Tunnel Include |

## 구조

```
src/
└── components/
└──   coder/
└──     coder.authentik.component.ts
└──     coder.base.component.ts
└──     coder.helm-chart.component.ts
└──     coder.resources.component.ts
└──     coder.service-mesh.component.ts
└──     coder.workspace-mesh-proxy.component.ts
└──     index.ts
└──   index.ts
└──   qbittorrent/
└──     index.ts
└──     qbittorrent.app.component.ts
└──     qbittorrent.backup.component.ts
└──     qbittorrent.service-mesh.component.ts
└──   vikunja/
└──     index.ts
└──     vikunja.authentik.component.ts
└──     vikunja.backup.component.ts
└──     vikunja.base.component.ts
└──     vikunja.helm-chart.component.ts
└──     vikunja.service-mesh.component.ts
└──   zero-trust/
└──     index.ts
└──     zero-trust.access.component.ts
└──     zero-trust.authentik.component.ts
└──     zero-trust.connector.component.ts
└──     zero-trust.gateway.component.ts
└──     zero-trust.tunnel.component.ts
└── contract.ts
└── index.ts
```

## 의존성

- `@common/bridged-provider` (workspace:*)
- `@common/custom-resources` (workspace:*)
- `@common/nexus` (workspace:*)
- `@common/utils` (workspace:*)
- `@infra/cloudflare` (workspace:*)
- `@infra/k8s-workstation-system` (workspace:*)
- `@pulumi/cloudflare` (^6.17.0)
- `@pulumi/kubernetes` (^4.31.1)
- `@pulumi/pulumi` (^3.242.0)
- `@pulumi/random` (^4.21.0)
- `@pulumi/vault` (^7.10.0)
- `cron-time-generator` (^2.0.3)
- `dedent` (^1.7.2)
- `lodash` (^4.18.1)
- `timezone-enum` (^1.0.4)
- `yaml` (^2.8.3)

## 명령

```bash
pnpm --filter @infra/k8s-workstation-tools build
pnpm --filter @infra/k8s-workstation-tools eslint
pnpm --filter @infra/k8s-workstation-tools test
pnpm --filter @infra/k8s-workstation-tools pulumi:preview
pnpm --filter @infra/k8s-workstation-tools pulumi:up
```
