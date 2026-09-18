# @infra/cloudflare

Cloudflare에서 `ayteneve93.com` zone의 DNS 레코드를 Pulumi로 관리하는 인프라 스택.

## 역할

- `ayteneve93.com` zone 조회 및 CNAME 레코드 관리를 담당한다.
- 서비스별 proxied 여부를 개별 설정한다 (`records.workstation` 컴포넌트 내부 주석 참고).
- workstation 도메인(`commonEsc.esc.workstationIptimeDomain`)과 GitHub owner 정보(`githubEsc.esc.apexCaptain.owner`)를 조합해 레코드를 구성한다.

## Pulumi 프로젝트

- ESC: `cloudflareEsc`(API 토큰·이메일·zone ID), `commonEsc`(workstation 도메인), `githubEsc`(GitHub owner)를 참조한다.
- output으로 zone 도메인과 `ayteneve93com` 레코드 목록을 노출한다.
- secret으로 Cloudflare API 토큰·이메일을 반환한다.

## 현재 컴포넌트

| 컴포넌트                            | 역할                                                   |
| ------------------------------------ | ------------------------------------------------------ |
| `Ayteneve93comRecordsComponent`      | `ayteneve93.com` zone에 대한 CNAME 레코드 생성·관리    |

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
