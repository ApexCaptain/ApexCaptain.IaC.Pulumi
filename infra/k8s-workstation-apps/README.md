# @infra/k8s-workstation-apps

Workstation **사용자 앱** Pulumi 스택 — Jellyfin 등.

## 역할

- system 스택 output(mesh gateway, storage class, Authentik group) 참조
- PROD 스택에서만 앱 배포 (dev/staging은 비용·노이즈 절감)
- Authentik OIDC Provider는 Pulumi로 선언, 앱별 수동 UI 설정은 최소화

### 현재 앱

| 앱 | 인증 | mesh |
|----|------|------|
| **Jellyfin** | Authentik OIDC + jellyfin-plugin-sso (Admin UI 수동) | ambient, ingress SA ALLOW |

## Pulumi 프로젝트

| 항목 | 값 |
|------|-----|
| 기본 스택 | `prod` |
| ESC | `k8sWorkstationAppsEsc`, `commonEsc` |

## 구조

```
src/
├── contract.ts
└── components/
    └── jellyfin/
        ├── jellyfin.authentik.component.ts
        ├── jellyfin.helm-chart.component.ts
        └── jellyfin.service-mesh.component.ts
```

## 의존성

- `@infra/cloudflare`, `@infra/k8s-workstation-system`
- `@common/nexus`, `@common/utils`, `@common/custom-resources`, `@common/bridged-provider`

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
