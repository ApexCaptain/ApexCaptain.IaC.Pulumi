# @infra/k8s-workstation-tools

Workstation **도구/유틸** Pulumi 스택 — Coder, qBittorrent, Vikunja.

## 역할

- system 스택 output 참조 (`pcloudBackup` platform 이름 등)
- VPN sidecar, Authentik proxy/OIDC, Coder workspace mesh proxy 등 앱 특성에 맞는 패턴 혼합

### 현재 도구

| 도구 | 스택 | DB | 인증 | mesh |
|------|------|-----|------|------|
| **Coder** | prod | CNPG (외부 PG) | Authentik OIDC + GitHub external auth | ambient, ingress SA ALLOW + sysbox workspace SOCKS5 mesh proxy |
| **Vikunja** | prod | CNPG (외부 PG) | Authentik OIDC (네이티브) | ambient, ingress SA ALLOW |
| **qBittorrent** | prod | — | Authentik Proxy + Outpost. SFTP는 Vault SSH CA (`SftpV3Component`) | ext-authz. SFTP는 Istio direct gateway TCP. NordLynx sidecar |

### pCloud 백업 (Lane A dr)

system `pcloudBackup` platform을 참조. CronJob은 각 도구 스택에서 선언.

| 도구 | 컴포넌트 | 대상 | 스케줄 |
|------|----------|------|--------|
| **qBittorrent** | `QbittorrentBackupComponent` | PVC `qbittorrent-config` only | 01:00 Asia/Seoul, `keepWithin=2d` |

Vault raft 백업은 `@infra/k8s-workstation-system`의 `VaultBackupComponent` (02:00 KST).

## Pulumi 프로젝트

| 항목 | 값 |
|------|-----|
| 프로젝트 | `k8s-workstation-tools` |
| 기본 스택 | `prod` (Coder, Vikunja, qBittorrent) |
| ESC | `k8sWorkstationToolsEsc`, `commonEsc` |

`dev` 스택은 존재하지만 현재 배포 리소스 없음.

## 구조

```
src/
├── contract.ts
└── components/
    ├── coder/       # base(CNPG) → authentik → helm → service-mesh
    │                # → coderd resources + workspace-mesh-proxy (SOCKS5)
    ├── vikunja/     # base(CNPG) → authentik → helm → service-mesh
    └── qbittorrent/ # app → NordLynx/SftpV3 → authentik proxy mesh → backup(dr config)
```

## 의존성

- `@infra/cloudflare`, `@infra/k8s-workstation-system`
- `@common/nexus`, `@common/utils`, `@common/custom-resources`, `@common/bridged-provider` (authentik, coderd)
- `@pulumi/random` (Vikunja secret 등), `@pulumi/vault`, `@pulumi/kubernetes`

## 명령

```bash
pnpm --filter @infra/k8s-workstation-tools build
pnpm --filter @infra/k8s-workstation-tools eslint
pnpm --filter @infra/k8s-workstation-tools pulumi:preview
pnpm --filter @infra/k8s-workstation-tools pulumi:up
```

## 배포 순서

1. `k8s-workstation-system` (CNPG operator, sysbox, lxcfs, generic-device-plugin, pCloud platform, snapshot-controller 포함)
2. `k8s-workstation-tools`

Coder/Vikunja는 CNPG Cluster → Helm → ServiceMesh → Authentik OIDC wiring 순.

## upstream

- `@infra/cloudflare`
- `@infra/k8s-workstation-system`
