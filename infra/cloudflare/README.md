# @infra/cloudflare

Pulumi로 Cloudflare DNS 존·레코드를 관리하는 인프라 패키지이다. 워크스테이션 도메인(`ayteneve93.com`)과 공개 앱 도메인(`itemguesser.com`)을 담당한다.

## 역할

- Cloudflare Provider·존 조회 및 DNS 레코드 컴포넌트를 `@common/nexus` Contract로 묶어 스택 출력·시크릿을 노출한다.
- `ayteneve93.com`: 워크스테이션 서비스용 CNAME 등 기존 레코드 구성.
- `itemguesser.com`: 공개 HTTPS 경로·앱용 레코드(현재 test POC). proxied 여부는 서비스마다 다르며 각 records 컴포넌트 주석을 따른다.
- API 토큰·이메일은 Pulumi ESC(`cloudflareEsc` 등)에서 읽고, 시크릿으로만 export한다.

## Pulumi 프로젝트

- 패키지 이름: `@infra/cloudflare` (`infra/cloudflare`).
- 설정·비밀: `nexus.esc.cloudflareEsc`(프로젝트), `commonEsc`(워크스테이션 도메인), `githubEsc`(GitHub owner 등). 존 ID는 ESC의 `zones.ayteneve93com`·`zones.itemguessercom`을 사용한다.

## 배포 순서

모노레포 인프라 스택 중 **가장 먼저** 배포한다. DNS가 선행되지 않으면 하위 K8s·앱 스택의 외부 도메인 연동이 맞지 않을 수 있다.

```
cloudflare → k8s-workstation-system → k8s-workstation-apps
                                   → k8s-workstation-tools
```

## upstream / downstream

- **upstream:** 저장소 내 다른 `@infra/*` 스택에 의존하지 않는다. 공통 ESC·GitHub ESC만 참조한다.
- **downstream:** `k8s-workstation-system`·`k8s-workstation-apps`·`k8s-workstation-tools` 등이 동일 워크스테이션 도메인·공개 호스트명을 전제로 할 때 이 스택 출력(`zones`, `records`)·DNS 실체와 정합이 필요하다.

## 현재 존·컴포넌트

| 컴포넌트 | 존 | 요약 |
| -------- | --- | ---- |
| `Ayteneve93comRecordsComponent` | `ayteneve93.com` | 워크스테이션 CNAME·관련 레코드 |
| `ItemguessercomRecordsComponent` | `itemguesser.com` | 공개 HTTPS·앱용 레코드(POC) |

Contract `output`은 존 도메인과 각 컴포넌트의 `records`를 묶어 export한다.

## 구조

```
src/
└── components/
└──   ayteneve93com/
└──     ayteneve93com.records.component.ts
└──     index.ts
└──   index.ts
└──   itemguessercom/
└──     index.ts
└──     itemguessercom.records.component.ts
└── contract.ts
└── index.ts
```

## 의존성

- `@common/nexus` (workspace:*)
- `@common/utils` (workspace:*)
- `@pulumi/cloudflare` (^6.23.1)
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

## 참조

- [외부 RDP 접속 — Cloudflare Zero Trust(WARP) + Authentik](docs/issues/resolved/2026-10-16-warpgate-authentik-rdp.md)
- [Windows PC WSL에 외부 SSH 접속 (Cloudflare Zero Trust 경유)](docs/issues/resolved/2026-10-18-wsl-ssh-zero-trust.md)
- [cloudflared eMudhra 인증서 침해 대응 — 2026.10.2+ 업그레이드](docs/issues/resolved/2026-10-27-cloudflared-emudhra-cert-upgrade.md)
