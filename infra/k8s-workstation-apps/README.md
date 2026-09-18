# @infra/k8s-workstation-apps

Workstation 클러스터에서 사용자에게 노출되는 애플리케이션 스택 — Jellyfin, Price Quest.

## 역할

- `k8s-workstation-system`이 제공하는 mesh gateway, storage class, Authentik 그룹 등을 참조해 사용자 서비스를 배포한다.
- Jellyfin은 PROD 스택에서만 배포한다. dev/staging 환경은 비용과 노이즈를 줄이기 위해 제외한다.

## 현재 앱

| 앱          | 인증                     | 스토리지                                          | 네트워크                        |
| ----------- | ------------------------ | -------------------------------------------------- | ------------------------------- |
| Jellyfin    | Authentik OIDC (그룹 기반 접근 제어) | Longhorn PVC 3종 — config(SSD, 5Gi), media(HDD, 2Ti), cache(SSD, 10Gi) | Direct Gateway를 통한 SFTP 노출, Vault 발급 SSH CA |
| Price Quest | Vault 연동 base 컴포넌트 | -                                                   | -                                |

## 배포 순서

`cloudflare` → `k8s-workstation-system` → **`k8s-workstation-apps`**

`k8s-workstation-system`의 mesh gateway, storage class, Authentik 그룹 output이 먼저 존재해야 배포할 수 있다.

## upstream / downstream

- **upstream:** `@infra/cloudflare` (DNS 레코드), `@infra/k8s-workstation-system` (mesh gateway path, storage class, Authentik/Vault provider config)
- **downstream:** 없음 — 다른 infra 패키지가 이 스택의 output을 참조하지 않는다.

## 구조

```
src/
└── components/
└──   index.ts
└──   jellyfin/
└──     index.ts
└──     jellyfin.authentik.component.ts
└──     jellyfin.helm-chart.component.ts
└──     jellyfin.service-mesh.component.ts
└──   price-quest/
└──     index.ts
└──     price-quest.base.component.ts
└──     price-quest.vault.component.ts
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
- `@pulumi/kubernetes` (^4.31.1)
- `@pulumi/pulumi` (^3.242.0)
- `@pulumi/vault` (^7.10.0)
- `dedent` (^1.7.2)
- `lodash` (^4.18.1)
- `yaml` (^2.8.3)

## 명령

```bash
pnpm --filter @infra/k8s-workstation-apps build
pnpm --filter @infra/k8s-workstation-apps eslint
pnpm --filter @infra/k8s-workstation-apps test
pnpm --filter @infra/k8s-workstation-apps pulumi:preview
pnpm --filter @infra/k8s-workstation-apps pulumi:up
```
