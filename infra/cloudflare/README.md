# @infra/cloudflare

`ayteneve93.com` zone의 DNS 레코드를 Pulumi로 관리하는 Cloudflare 인프라 패키지.

## 역할

- `ayteneve93.com` zone의 CNAME 레코드를 선언적으로 관리한다.
- 레코드별 proxied 여부를 서비스 특성에 맞게 개별 설정한다.
- workstation 도메인(iptime)과 GitHub owner 정보를 참조해 레코드 값을 구성한다.

## Pulumi 프로젝트

- ESC: `cloudflareEsc`(API 토큰·이메일·zone ID), `commonEsc`(workstation 도메인), `githubEsc`(GitHub owner)를 사용한다.
- 출력: `zones.ayteneve93com`에 zone 도메인과 레코드 목록을 노출한다.
- 시크릿: Cloudflare API 토큰·이메일을 `secret`으로 export한다.

## 배포 순서

- infra 스택 중 최상단에 위치한다. 다른 workstation 스택(`k8s-workstation-system` 등)보다 선행 조건이 없다.

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
