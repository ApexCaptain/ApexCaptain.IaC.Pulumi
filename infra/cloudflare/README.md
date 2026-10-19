# @infra/cloudflare

`ayteneve93.com` Cloudflare zone의 DNS(CNAME 등)를 Pulumi로 관리하는 인프라 패키지이다.

## 역할

- workstation 및 관련 서비스용 도메인 레코드를 코드로 정의·적용한다.
- zone 조회, Provider 설정, 레코드 컴포넌트 출력을 contract로 묶어 다른 스택에서 참조할 수 있게 한다.
- proxied(Cloudflare 프록시) 여부는 서비스마다 다르며, `ayteneve93com` records 컴포넌트 주석을 기준으로 한다.

## Pulumi 프로젝트

- 모노레포 infra 배포 순서상 **가장 먼저** 적용하는 스택이다.
- ESC는 `@common/nexus`의 `cloudflareEsc`(API·zone), `commonEsc`(workstation 도메인), `githubEsc`(GitHub owner 등)를 사용한다.
- contract는 zone 메타·레코드 목록을 `output`으로, Cloudflare API 자격은 `secret`으로 내보낸다.

## 배포 순서

```
cloudflare → k8s-workstation-system → k8s-workstation-apps
                                   → k8s-workstation-tools
```

- Kubernetes workstation 스택들보다 **선행**한다. 공통 workstation 도메인(`commonEsc`)과 zone 레코드가 맞아야 이후 Ingress·외부 접속 구성이 일관된다.

## upstream / downstream

- **upstream:** workspace 내 다른 `@infra/*` Pulumi 스택에 대한 contract 의존은 없다.
- **downstream:** `@infra/k8s-workstation-system`, `@infra/k8s-workstation-apps`, `@infra/k8s-workstation-tools`가 `output.zones.ayteneve93com`(zone 도메인·레코드 FQDN)을 참조한다.
- Cloudflare Zero Trust(WARP·터널·Gateway)는 Authentik OIDC에 의존해 순환을 피하려고 이 스택이 아니라 `@infra/k8s-workstation-tools`에서 관리한다.

## 현재 관리 범위

| 컴포넌트 | 설명 |
| -------- | ---- |
| `ayteneve93com` (`Ayteneve93comRecordsComponent`) | `ayteneve93.com` zone CNAME·관련 레코드. `workstationDomain`, GitHub owner 등 ESC 입력으로 생성 |

## 구조

```
src/
└── components/
└──   ayteneve93com/
└──     ayteneve93com.records.component.ts
└──     index.ts
└──   index.ts
└── contract.ts
└── index.ts
```

## 의존성

- `@common/nexus` (workspace:*)
- `@common/utils` (workspace:*)
- `@pulumi/cloudflare` (^6.17.0)
- `@pulumi/pulumi` (^3.242.0)
- `dedent` (^1.7.2)
- `lodash` (^4.18.1)
- `yaml` (^2.8.3)

## 명령

```bash
pnpm --filter @infra/cloudflare build
pnpm --filter @infra/cloudflare eslint
pnpm --filter @infra/cloudflare test
pnpm --filter @infra/cloudflare pulumi:preview
pnpm --filter @infra/cloudflare pulumi:up
```

