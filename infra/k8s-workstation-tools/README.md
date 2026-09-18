# @infra/k8s-workstation-tools

Workstation 환경에 배포되는 도구(Coder, qBittorrent, Vikunja) 스택.

## 역할

- NordLynx VPN sidecar로 트래픽을 터널 밖으로만 내보내는 구조를 적용한 도구(qBittorrent)를 구성한다.
- Web UI 노출이 필요한 컴포넌트는 Longhorn과 동일한 Authentik Proxy + OutpostProviderAttachment 패턴으로 인증을 붙인다.
- `PROD` 스택에서만 생성되는 Production 전용 컴포넌트로 구성되어 있다.

## 현재 앱/도구

| 컴포넌트    | 인증                                       | 비고                                                                 |
| ----------- | ------------------------------------------ | -------------------------------------------------------------------- |
| `coder`     | Authentik OIDC (implicit consent flow)     | PostgreSQL 클러스터(Longhorn SSD PVC) 포함, GitHub External Auth 연동, Istio Service Mesh AuthorizationPolicy로 워크스페이스 네임스페이스만 인그레스 허용 |
| `qbittorrent` | Authentik Proxy + OutpostProviderAttachment | NordLynx VPN sidecar로 아웃바운드 트래픽 격리, 백업 컴포넌트 별도 존재 |
| `vikunja`   | Authentik Proxy + OutpostProviderAttachment | Authentik·Helm Chart·Service Mesh 컴포넌트로 구성                     |

## upstream

- `@infra/cloudflare` — `zones.ayteneve93com.records`의 호스트(coder, todo, auth 등)를 참조한다.
- `@infra/k8s-workstation-system` — Authentik/Vault Provider 설정, Authentik 그룹·플로우, StorageClass, 네임스페이스, ServiceAccount, Gateway Path 등을 참조한다.

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
