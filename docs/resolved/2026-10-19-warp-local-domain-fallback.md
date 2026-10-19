# WARP 연결 시 사설 DNS 도메인(`*.jisungit.k8s`) 접근 불가

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-19 |
| **영역** | `infra/k8s-workstation-tools` Zero Trust 디바이스 기본 프로필, 클라이언트 PC(WARP) |
| **관련 코드** | `infra/k8s-workstation-tools/src/components/zero-trust/zero-trust.access.component.ts`, `infra/k8s-workstation-tools/src/contract.ts`, `common/nexus/src/esc/cloudflare.esc.ts`, `scripts/sync-pulumi-esc.script.ts` |
| **관련 이슈** | [외부 RDP Zero Trust (해결)](../resolved/2026-10-16-warpgate-authentik-rdp.md) |
| **상태** | **해결** |
| **해결일** | 2026-10-19 |

## 배경

클라이언트 PC는 다른 환경(jisung)의 사설 DNS로 `*.jisungit.k8s`를 푼다. 공개 DNS 레코드는 없다. 이 PC에서 RDP용 WARP를 켜면 `windows.ayteneve93.com`은 정상이지만 `git.jisungit.k8s` 등 사설 도메인 접근이 끊겼다.

## 원인

- Split Tunnel Include 모드는 IP 라우팅만 제한한다. DNS는 WARP가 OS 전체를 가져가 Gateway(DoH)로 보낸다
- `windows.ayteneve93.com`은 Gateway DNS override가 있어 풀린다
- `jisungit.k8s`는 Gateway가 모르는 이름이라 NXDOMAIN. 기기 원래 DNS로는 질의가 가지 않는다

## 접근 비교

| 방법 | 장점 | 단점 |
|---|---|---|
| 클라이언트 hosts 파일 | 즉시 동작 | 와일드카드 불가, IP 변경 시 수동 |
| 클라이언트 NRPT 규칙 | suffix 단위 | WARP DNS 가로채기와 충돌 가능, 버전 의존 |
| **Local Domain Fallback (채택)** | suffix 단위, IaC 관리, 기기 원래 DNS 사용 | 기본 프로필이라 전 기기 적용(해당 suffix만 영향) |

## 조치

- `ZeroTrustDeviceDefaultProfileLocalDomainFallback` 추가. `dnsServers`를 비워 기기 원래 DNS로 보낸다 → 사설 DNS IP를 이 레포에 두지 않는다
- 도메인은 코드에 하드코딩하지 않고 env → ESC로 관리
  - env: `.secrets/.pulumi/.env/cloudflare.env`의 `CLOUDFLARE_ZERO_TRUST_LOCAL_DOMAIN_FALLBACKS` (CSV, suffix만. 예: `jisungit.k8s,foo.internal`)
  - ESC: `cloudflare.zeroTrust.localDomainFallbacks` (`{ suffix, description?, dnsServers? }[]`)
  - 스키마에서 `*.`·앞뒤 `.` 제거, 소문자화, 도메인 형식 검증
- suffix 매칭이라 `jisungit.k8s` 하나로 하위 전체(`*.jisungit.k8s`)가 적용된다

## 주의

- 이 리소스는 목록 **전체 교체**다. Cloudflare 기본 suffix 14개(`home.arpa`, `intranet`, `internal`, `private`, `localdomain`, `domain`, `lan`, `home`, `host`, `corp`, `local`, `localhost`, `invalid`, `test`, 2026-10-19 계정 조회값)를 코드 상수로 함께 넣는다
- provider 경고: Pulumi에서 리소스를 지워도 Cloudflare에는 마지막 목록이 남는다. 되돌릴 땐 대시보드·API로 직접 정리
- 도메인 추가: env 수정 → `pnpm script:syncPulumiEsc` → `pulumi up` → 클라이언트 WARP 재연결

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-19 | 등록. 원인 확인(WARP DNS가 Gateway로만 감) |
| 2026-10-19 | Local Domain Fallback + env/ESC 연동 구현, ESC sync, prod preview(+1 create) |
| 2026-10-19 | prod `up` 후 클라이언트에서 `*.jisungit.k8s` 접근 확인. 해결 |
