# @infra/k8s-workstation-apps

Workstation **사용자 앱** Pulumi 스택 — Jellyfin, Price Quest 등.

## 역할

- system 스택 output(mesh gateway, storage class, Authentik group, Vault provider) 참조
- Jellyfin은 PROD 스택에서만 배포 (dev/staging은 비용·노이즈 절감)
- Price Quest는 스택별(`dev`/`prod`) namespace·Vault 시크릿을 선언 (Helm·mesh는 후속)

### 현재 앱

| 앱 | 스택 | DB | 인증 | mesh |
|----|------|-----|------|------|
| **Jellyfin** | prod | — | Authentik OIDC + jellyfin-plugin-sso (Admin UI 수동) | ambient, ingress SA ALLOW |
| **Price Quest** | dev, prod | — | Vault OIDC developer group (`SecretV1Component`) | ambient namespace만 |

Price Quest Vault 경로: `secret/price-quest/api/{stack}/{shared|developer|runtime}`

## Pulumi 프로젝트

| 항목 | 값 |
|------|-----|
| 기본 스택 | `prod` |
| ESC | `k8sWorkstationAppsEsc`, `commonEsc` |

`apps/dev`는 `system/prod` output을 참조 (`resolveReferencedStackStage`).

## 구조

```
src/
├── contract.ts
└── components/
    ├── jellyfin/
    │   ├── jellyfin.authentik.component.ts
    │   ├── jellyfin.helm-chart.component.ts
    │   └── jellyfin.service-mesh.component.ts
    └── price-quest/
        ├── price-quest.base.component.ts      # namespace (price-quest-{stack})
        └── price-quest.vault.component.ts     # SecretV1 (shared/developer/runtime)
```

## 의존성

- `@infra/cloudflare`, `@infra/k8s-workstation-system`
- `@common/nexus`, `@common/utils`, `@common/custom-resources`, `@common/bridged-provider`
- `@pulumi/vault` (Price Quest Vault 시크릿)

## 명령

```bash
pnpm --filter @infra/k8s-workstation-apps build
pnpm --filter @infra/k8s-workstation-apps pulumi:preview
pnpm --filter @infra/k8s-workstation-apps pulumi:up
```

## 배포 순서

`k8s-workstation-system` (prod) 배포 완료 후 실행.

## upstream

- `@infra/cloudflare`
- `@infra/k8s-workstation-system`
