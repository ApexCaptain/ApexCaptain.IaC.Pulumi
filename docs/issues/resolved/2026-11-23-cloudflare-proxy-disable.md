# Cloudflare 프록시 전면 해제 (DNS only)

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-11-23 |
| **영역** | Cloudflare zone `ayteneve93.com`, `infra/cloudflare`, `infra/k8s-workstation-system`(Istio) |
| **관련 코드** | `infra/cloudflare/src/components/ayteneve93com/ayteneve93com.records.component.ts`, `infra/k8s-workstation-system/src/components/istio/istio.helm-chart.component.ts`(`numTrustedProxies`) |
| **상태** | **해결** |
| **해결일** | 2026-11-23 |

## 해결 요약

`ayteneve93.com` 레코드 전부 DNS only, Istio `numTrustedProxies: 0`, ingress gateway 재시작까지 반영. `blog`는 Cloudflare 엣지 인증서에 가려 GitHub Pages 인증서가 없었고, Pages 빌드도 2026-07-05부터 멈춰 있었다 → 재빌드 + custom domain 재등록으로 인증서 발급, Enforce HTTPS 켬.

주의: `blog` 레코드를 다시 프록시로 켜면 GitHub Pages 인증서 자동 갱신(다음 만료 2027-02-21)이 실패한다.

## 배경

레퍼런스 프로젝트(welders IaC)는 Cloudflare 레코드를 전부 DNS only로 둔다. 한국에서 프록시를 켜면 엣지가 시애틀·LA 등 미국으로 잡혀 TTFB가 20~40배 늘었다(레퍼런스 실측: `colo=SEA`, 프록시 경유 0.5~1.2초 vs 직접 0.03초). 엣지 선택은 Cloudflare 요금제 우선순위·통신사 피어링 문제라 서버 쪽에서 고칠 수 없다.

## 현재 상태 (변경 전)

- proxied: `auth`, `longhorn`, `vault`, `argo-cd`, `grafana`, `blog`
- DNS only: `workstation`, `jellyfin`, `torrent`, `test`, `todo`, `coder`, `goldilocks`, itemguesser `test`

## 결정 (2026-11-23, 사용자)

모든 레코드를 `proxied: false`로 바꾼다.

| 영향 | 판단 |
|---|---|
| 집 IP 노출 | 새로 늘지 않음. `workstation` CNAME(iptime DDNS)이 이미 DNS only |
| Istio `numTrustedProxies` | 1 → 0. 앞단 L7 프록시가 없어져 1이면 클라이언트가 보낸 `X-Forwarded-For`를 그대로 믿게 됨 |
| WAF·DDoS·엣지 TLS | 잃음. 서비스는 Authentik(OIDC/outpost) 뒤에 있음. 홈랩이라 수용 |
| origin 인증서 | 이미 DNS only 호스트(jellyfin·coder 등)가 정상 동작. 대상이 모두 1단계 이름 |
| `blog` → github.io | GitHub Pages는 DNS only를 권장 |

## 조치

- 레코드 6개 `proxied: true → false` (preview: 6 update)
- Istio `meshConfig.defaultConfig.gatewayTopology.numTrustedProxies: 0` (preview: `istiodRelease` values 1 update)

## 수용 기준

- [x] `cloudflare` 스택 `pulumi up`
- [x] `k8s-workstation-system` 스택 `pulumi up`
- [x] ingress gateway 재시작 (`gatewayTopology`는 프록시 시작 시 읽음). config_dump에서 `xff_num_trusted_hops` 1 → 0(기본값이라 생략) 확인
- [x] `dig +short grafana.ayteneve93.com`이 Cloudflare anycast가 아닌 DDNS IP로 나옴
- [x] auth·vault·argo-cd·grafana·longhorn HTTPS 응답 정상 (TTFB 0.02~0.1초, 인증서 검증 OK)
- [x] `blog` HTTPS: GitHub Pages가 `blog.ayteneve93.com` 인증서 발급 (현재 `*.github.io` 인증서라 검증 실패, HTTP는 200). 발급 후 Pages 설정에서 Enforce HTTPS 켜기 (완료, HTTP → 301)
- [x] 사용자: 브라우저로 각 서비스 접속 확인

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-11-23 | 등록. 레코드 전부 DNS only, `numTrustedProxies` 0으로 변경. preview 확인 |
| 2026-11-23 | `cloudflare`(6 updated)·`k8s-workstation-system`(istiod 1 updated) `pulumi up`, ingress gateway rollout restart. 5개 서비스 정상, `blog`는 GitHub Pages 인증서 미발급(이전엔 Cloudflare 엣지 인증서가 대신함) |
| 2026-11-23 | 사용자 브라우저 접속 확인 완료. `blog` Pages 인증서는 아직 미발급(`https_certificate: null`, `status: building`) |
| 2026-11-23 | Pages 최신 빌드가 2026-07-05부터 `building`에 멈춰 있던 것 발견. 재빌드 요청 → 빌드 성공(`built`). 약 10분 뒤에도 `https_certificate: null` |
| 2026-11-23 | Pages custom domain 제거 후 재등록 → Let's Encrypt 인증서 `blog.ayteneve93.com` 승인(만료 2027-02-21). HTTPS 200·검증 OK. Enforce HTTPS는 아직 off |
| 2026-11-23 | Enforce HTTPS 켬(`http://` → 301). 해결, `resolved/`로 이동 |
