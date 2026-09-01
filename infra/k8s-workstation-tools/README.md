# @infra/k8s-workstation-tools

Workstation **도구/유틸** Pulumi 스택 — Coder, qBittorrent, Vikunja 등.

## 역할

- system 스택 output 참조
- VPN sidecar, Authentik proxy/OIDC, Coder workspace mesh proxy 등 앱 특성에 맞는 패턴 혼합

### 현재 도구

| 도구 | 스택 | DB | 인증 | mesh |
|------|------|-----|------|------|
| **Coder** | prod | CNPG (외부 PG) | Authentik OIDC + GitHub external auth | ambient, ingress SA ALLOW + sysbox workspace mesh proxy |
| **Vikunja** | prod | CNPG (외부 PG) | Authentik OIDC (네이티브) | ambient, ingress SA ALLOW |
| **qBittorrent** | prod | — | Authentik Proxy + Outpost | ext-authz |

## Pulumi 프로젝트

| 항목 | 값 |
|------|-----|
| 기본 스택 | `prod` (Coder, Vikunja, qBittorrent) |
| ESC | `k8sWorkstationToolsEsc`, `commonEsc` |

`dev` 스택은 존재하지만 현재 배포 리소스 없음.

## 구조

```
src/
├── contract.ts
└── components/
    ├── coder/       # base(CNPG) → authentik → helm → service-mesh → coderd resources
    ├── vikunja/     # base(CNPG) → authentik → helm → service-mesh
    └── qbittorrent/ # NordLynx VPN sidecar → authentik proxy mesh
```

## 의존성

- `@infra/cloudflare`, `@infra/k8s-workstation-system`
- `@common/nexus`, `@common/utils`, `@common/custom-resources`, `@common/bridged-provider` (authentik, coderd)
- `@pulumi/random` (Vikunja secret 등), `@pulumi/vault`

## 명령

```bash
pnpm --filter @infra/k8s-workstation-tools build
pnpm --filter @infra/k8s-workstation-tools pulumi:preview
pnpm --filter @infra/k8s-workstation-tools pulumi:up
```

## 배포 순서

1. `k8s-workstation-system` (CNPG operator, sysbox, lxcfs, generic-device-plugin 포함)
2. `k8s-workstation-tools`

Coder/Vikunja는 CNPG Cluster → Helm → ServiceMesh → Authentik OIDC wiring 순.

## upstream

- `@infra/cloudflare`
- `@infra/k8s-workstation-system`
