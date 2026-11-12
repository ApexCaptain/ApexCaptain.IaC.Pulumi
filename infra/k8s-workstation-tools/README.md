# @infra/k8s-workstation-tools

워크스테이션 Kubernetes 클러스터에 Coder, Vikunja, qBittorrent, Zero Trust 도구를 배포하는 Pulumi 인프라 스택이다.

## 역할

- `prod` 스택에서만 Coder, Vikunja, qBittorrent, Zero Trust를 `./phases` 조립 순서대로 배포한다.
- NordLynx VPN 사이드카로 특정 트래픽만 터널 밖으로 보낸다.
- Web UI는 Longhorn과 동일하게 Authentik Proxy와 OutpostProviderAttachment 패턴을 쓴다.
- 스택 산출물은 `output`·`secret`을 re-export하며, contract hash에 맞추기 위해 output 객체 키 순서를 바꾸지 않는다.

## Pulumi 프로젝트

- 기본 스택: `prod` (도구 배포는 이 스택에서만 수행)
- 인프라 코드: `src/contract.ts`, 단계별 조립은 `src/phases/`

## 배포 순서

모노레포 인프라 스택 순서상 `@infra/cloudflare` → `@infra/k8s-workstation-system` 이후에 이 패키지를 preview·up 한다. `k8s-workstation-apps`와 병렬에 가깝게 배포할 수 있다.

스택 내부 단계 순서: `deployProviders` → Coder → Vikunja → qBittorrent → Zero Trust. 단계 간 의존은 `providers` 인자와 각 컴포넌트의 `dependsOn`으로 표현된다.

## upstream / downstream

- **upstream:** `@infra/cloudflare`, `@infra/k8s-workstation-system` (네트워크·클러스터·공통 프로바이더 전제)
- **downstream:** manifest 기준으로 이 스택을 contract로 참조하는 별도 infra 패키지는 없음

## 현재 앱/도구

| 구성 요소 | 요약 |
| -------- | ---- |
| **Coder** | Helm·리소스·Authentik·서비스 메시 단계로 원격 개발 환경 |
| **Vikunja** | 할 일 관리 앱 (Helm, Authentik, 백업, 서비스 메시) |
| **qBittorrent** | 토렌트 클라이언트 (앱, 백업, 서비스 메시) |
| **Zero Trust** | 액세스·Authentik·커넥터·게이트웨이·터널 구성 |

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
└──   zero-trust/
└──     index.ts
└──     zero-trust.access.component.ts
└──     zero-trust.authentik.component.ts
└──     zero-trust.connector.component.ts
└──     zero-trust.gateway.component.ts
└──     zero-trust.tunnel.component.ts
└── contract.ts
└── index.ts
└── phases/
└──   coder.ts
└──   index.ts
└──   providers.ts
└──   qbittorrent.ts
└──   vikunja.ts
└──   zero-trust.ts
```

## 의존성

- `@common/bridged-provider` (workspace:*)
- `@common/custom-resources` (workspace:*)
- `@common/nexus` (workspace:*)
- `@common/utils` (workspace:*)
- `@infra/cloudflare` (workspace:*)
- `@infra/k8s-workstation-system` (workspace:*)
- `@pulumi/cloudflare` (^6.23.1)
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

## 참조

- [`k8s-workstation-tools` contract.ts 비대화 — 단계 모듈로 분해](docs/issues/resolved/2026-10-28-tools-contract-split.md)
