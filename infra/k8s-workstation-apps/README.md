# @infra/k8s-workstation-apps

Jellyfin, Price Quest 등 워크스테이션 클러스터의 사용자 서비스를 배포하는 Pulumi 스택.

## 역할

- `k8s-workstation-system` 스택의 output(Istio mesh gateway, Longhorn storage class, Authentik 그룹 등)을 참조해 사용자 대상 애플리케이션을 배포한다.
- `components/jellyfin`을 통해 Jellyfin을 Authentik OIDC, SFTP, direct gateway, PVC와 함께 구성한다.
- `components/price-quest`를 통해 Price Quest 애플리케이션과 Vault 연동 설정을 구성한다.
- `pulumi.getStack()`이 `PROD`일 때만 Jellyfin을 배포한다 — dev/staging은 비용과 노이즈를 줄이기 위해 제외한다.

## 배포 순서

```
cloudflare → k8s-workstation-system → k8s-workstation-apps
```

`k8s-workstation-system` 스택이 먼저 배포되어 mesh gateway, storage class, Authentik/Vault provider 설정 등을 output으로 제공해야 이 스택을 배포할 수 있다.

## 현재 앱/도구

| 컴포넌트    | 설명                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Jellyfin    | Authentik OIDC 인증, Helm chart 배포, SFTP(사용자 인증서 기반) 업로드, Istio direct gateway, Longhorn PVC(설정/미디어/캐시 분리) 구성. PROD 스택에서만 배포. |
| Price Quest | 애플리케이션 본체(`price-quest.base.component.ts`)와 Vault 연동(`price-quest.vault.component.ts`) 컴포넌트로 구성.            |

## upstream

- `@infra/cloudflare` — 호스트 레코드(`jellyfin`, `auth` 등) 참조.
- `@infra/k8s-workstation-system` — mesh gateway, storage class, Authentik 그룹/플로우, Vault provider 설정 등 output 참조.

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
