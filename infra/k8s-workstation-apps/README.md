# @infra/k8s-workstation-apps

워크스테이션 Kubernetes 클러스터에 Jellyfin 등 사용자-facing 앱을 Pulumi로 배포하는 인프라 스택이다.

## 역할

- `@infra/k8s-workstation-system`이 제공하는 mesh gateway, StorageClass, Authentik·Vault 설정을 받아 앱 네임스페이스와 워크로드를 정의한다.
- `contract.ts`에서 스택별로 리소스 범위를 나누며, Jellyfin은 `PROD` 스택에서만 배포해 dev/staging의 비용·노이즈를 줄인다.
- `index.ts`는 `k8sWorkstationAppsContract`의 `output`·`secret`을 그대로 export해 다른 스택·패키지가 참조할 수 있게 한다.

## Pulumi 프로젝트

- 워크스테이션 kubeconfig는 공통 ESC(`commonEsc`)에서, 앱 스택 전용 값은 `k8sWorkstationAppsEsc`를 사용한다.
- Kubernetes·Authentik·Vault Provider는 system 스택의 provider 설정·Vault 클러스터 메타를 참조한다.

## 배포 순서

1. `@infra/cloudflare` — Jellyfin·Authentik 등 공개 호스트 DNS
2. `@infra/k8s-workstation-system` — Istio gateway, Longhorn StorageClass, Authentik/Vault 연동
3. **본 패키지** (`k8s-workstation-apps`)

`k8s-workstation-tools`와는 system 이후에 각각 독립 배포하면 된다.

## upstream / downstream

| 방향 | 패키지 | 참조 내용 |
|------|--------|-----------|
| upstream | `@infra/cloudflare` | `cloudflareContract` — 존 레코드(예: jellyfin, auth 호스트) |
| upstream | `@infra/k8s-workstation-system` | gateway 경로, StorageClass, Authentik 그룹·플로우, Vault mount·identity, GPU runtime 등 |
| downstream | (없음 또는 소비자 미정) | 본 스택 `output`/`secret` export |

## 현재 앱/도구

| 앱 | 스택 | 구성 요약 |
|----|------|-----------|
| Jellyfin | `PROD`만 | Authentik OIDC(`JellyfinAuthentikComponent`), Helm 배포·PVC(설정/미디어/캐시), Vault·SFTP, direct gateway·service mesh, 백업·GPU runtime |
| Price Quest | (contract 기준) | `price-quest` — base·Vault 연동 컴포넌트 |

## 구조

```
src/
└── components/
└──   index.ts
└──   jellyfin/
└──     index.ts
└──     jellyfin.authentik.component.ts
└──     jellyfin.backup.component.ts
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
- `cron-time-generator` (^2.0.3)
- `dedent` (^1.7.2)
- `lodash` (^4.18.1)
- `timezone-enum` (^1.0.4)
- `yaml` (^2.8.3)

## 명령

```bash
pnpm --filter @infra/k8s-workstation-apps build
pnpm --filter @infra/k8s-workstation-apps eslint
pnpm --filter @infra/k8s-workstation-apps test
pnpm --filter @infra/k8s-workstation-apps pulumi:preview
pnpm --filter @infra/k8s-workstation-apps pulumi:up
```
