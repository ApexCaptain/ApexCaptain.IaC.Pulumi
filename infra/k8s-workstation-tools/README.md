# @infra/k8s-workstation-tools

Coder, qBittorrent, Vikunja 등 워크스테이션 "도구" 앱을 배포하는 Pulumi 스택.

## 역할

- `pulumi.getStack() === StackStage.PROD`일 때만 도구 앱들을 생성하는 production 전용 스택이다.
- qBittorrent는 NordLynx VPN sidecar로 트래픽을 터널 밖으로 내보내지 않도록 구성한다.
- Web UI는 Longhorn과 동일하게 Authentik Proxy + OutpostProviderAttachment 패턴으로 인증을 처리한다.
- Coder는 Authentik OIDC와 GitHub External Auth를 연동하고, PostgreSQL을 백엔드로 사용하며 Istio `AuthorizationPolicy`로 ingress gateway와 워크스페이스 네임스페이스 접근을 제한한다.

## Pulumi 프로젝트

- 기본 스택: `prod` (`StackStage.PROD`일 때만 리소스가 생성됨)
- ESC: `commonEsc`, `k8sWorkstationToolsEsc`

## 현재 앱/도구

| 컴포넌트 | 인증 | 비고 |
| --- | --- | --- |
| `coder` | Authentik OIDC + GitHub External Auth | PostgreSQL(Longhorn SSD PVC) 백엔드, Istio `AuthorizationPolicy`로 ingress gateway·Sysbox Ubuntu 워크스페이스 네임스페이스만 허용 |
| `qbittorrent` | Authentik Proxy(OutpostProviderAttachment) | NordLynx VPN sidecar로 트래픽을 터널 밖으로만 전달, 백업 컴포넌트 포함 |
| `vikunja` | Authentik Proxy/OIDC(OutpostProviderAttachment) | 서비스 메시 적용, 백업 컴포넌트 포함 |

## upstream / downstream

- upstream: `@infra/cloudflare`(zone 레코드 — coder, todo, auth), `@infra/k8s-workstation-system`(vault, authentik 그룹/flow, storage class, istio 네임스페이스·서비스어카운트·gateway path)
- downstream: 없음 — 배포 순서상 최종 소비 스택

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
