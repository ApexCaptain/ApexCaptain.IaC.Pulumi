# @infra/k8s-workstation-apps

워크스테이션 Kubernetes 클러스터에 Jellyfin 등 사용자-facing 앱을 Pulumi로 배포하는 infra 스택이다.

## 역할

- `@infra/k8s-workstation-system`이 제공하는 mesh gateway, StorageClass, Authentik 그룹·플로, Vault 연동 정보를 소비한다.
- `@infra/cloudflare` DNS 레코드를 참조해 공개 호스트명을 앱에 연결한다.
- **Jellyfin**은 `prod` 스택에서만 배포한다. dev/staging에서는 비용과 운영 노이즈를 줄인다.
- `src/components` 아래 앱별 컴포넌트(Helm, Authentik, 서비스 메시, 백업, Vault 등)로 리소스를 조립한다.

## Pulumi 프로젝트

- kubeconfig는 ESC `commonEsc`의 `workstationKubeconfig`를 사용한다.
- 프로젝트 전용 설정은 ESC `k8sWorkstationAppsEsc`(예: Vault/인프라 알림용 Slack webhook)를 참조한다.
- Authentik·Vault Provider 설정은 `k8s-workstation-system` contract의 `secret.providerConfigs`를 재사용한다.

## 배포 순서

1. `@infra/cloudflare`
2. `@infra/k8s-workstation-system`
3. `@infra/k8s-workstation-apps` (본 패키지)

`k8s-workstation-system` 스택이 gateway 경로, StorageClass, Authentik/Vault 출력을 만든 뒤에 preview/up을 실행한다.

## upstream / downstream

| 방향 | 패키지 | 용도 |
|------|--------|------|
| upstream | `@infra/cloudflare` | Jellyfin·Authentik 등 공개 호스트 DNS |
| upstream | `@infra/k8s-workstation-system` | Istio gateway, Longhorn StorageClass, Authentik 그룹/플로, Vault·VSO, GPU runtime |
| downstream | — | 다른 infra 스택이 본 contract를 필수 참조하지 않음 |

## 현재 앱/도구

| 앱 | 스택 | 인증 | 스토리지 / 기타 |
|----|------|------|-----------------|
| **jellyfin** | `prod` | Authentik OIDC(`applicationUserGroup`, 기본 authorization/invalidation flow) | config `longhornSsdRetain` 5Gi, media `longhornHddRetain` 2Ti, cache `longhornSsd` 10Gi; Helm 공식 chart; GPU `runtimeClassName`; Istio direct gateway + SFTP(Vault SSH CA, System Manager 발급); 백업·서비스 메시 컴포넌트 |
| **price-quest** | 모든 스택 (PROD 분기 밖) | Vault 연동(`price-quest.vault`) | namespace 등 base 리소스(`price-quest.base`) |

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
