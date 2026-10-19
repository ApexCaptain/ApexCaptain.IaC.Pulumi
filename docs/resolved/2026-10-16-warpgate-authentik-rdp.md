# 외부 RDP 접속 — Cloudflare Zero Trust(WARP) + Authentik (구 Warpgate 안)

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-16 |
| **영역** | `infra/k8s-workstation-tools`, Authentik OIDC, Cloudflare Zero Trust, ESC |
| **관련 문서** | [설계 스펙](../superpowers/specs/2026-10-18-cloudflare-zero-trust-rdp-design.md), [구현 플랜](../superpowers/plans/2026-10-18-cloudflare-zero-trust-rdp.md) · 폐기: [Warpgate 스펙](../superpowers/specs/2026-10-16-warpgate-authentik-rdp-design.md), [Warpgate 플랜](../superpowers/plans/2026-10-16-warpgate-authentik-rdp.md) |
| **상태** | **해결** |
| **해결일** | 2026-10-18 |

## 해결 요약

Warpgate 안을 폐기하고 Cloudflare Zero Trust(WARP + cloudflared + Authentik OIDC/MFA)로 구현했다. `k8s-workstation-tools` PROD에 Zero Trust 컴포넌트 5개(authentik·access·tunnel·gateway·connector)를 배포했다(+22). 외부망에서 Client 등록 후 `mstsc windows.ayteneve93.com` 접속 성공. Client OFF 시 미해석, Split Tunnel 정상. 공인 inbound 포트는 새로 열지 않았다. RDP 인증서 경고는 클라이언트 "항상 신뢰"로 처리한다.

남은 선택 항목(이 레포 할 일 아님, 필요 시 새 이슈): Gateway Network 로그 allow 기록 확인(대시보드), `toolsManagerGroup` 밖 계정 거부 실테스트, Windows LE 인증서(win-acme), Authentik 장애용 One-time PIN, group claim 정책.

## 배경

외부에서 LAN Windows로 RDP할 때 `:3389` 직접 노출 없이, 네이티브 RDP 클라이언트 + Authentik MFA가 필요하다. Guacamole(웹 HTML5)는 UX·성능 요구와 맞지 않아 제외했다.

대상 PC는 클러스터 노드와 같은 망에 있고 IP는 `WORKSTATION_MAIN_PC_IP`(workstation env). 같은 망 MacBook에서 RDP 연결 테스트 완료(사용자, 2026-10-18).

## 현재 결정 (2026-10-18)

**Cloudflare Zero Trust**: 클라이언트 기기에 Cloudflare One Client(WARP) 설치 → Authentik OIDC 로그인 + MFA로 기기 등록 → `mstsc windows.ayteneve93.com` → Gateway DNS override·network 정책 → 클러스터 cloudflared(warp-routing) → Windows `:3389`.

- 공인 inbound 포트 신규 개방 없음. `windows` 공개 DNS 레코드 없음
- 원본 RDP (프록시 재인코딩 없음)
- 리소스는 `k8s-workstation-tools`에 둔다 (Access IdP가 Authentik secret을 필요로 해 `infra/cloudflare`에 두면 순환)

### 접근 비교

| 항목 | Warpgate (이전 안) | Cloudflare Zero Trust (채택) |
|---|---|---|
| 클라이언트 설치 | 불필요 | WARP 앱 필요 |
| RDP 품질 | Warpgate가 종료·재인코딩 | 원본 |
| 공인 포트 | Direct Gateway TCP 1개 | 0 |
| 클러스터 상태 | SQLite PVC·admin 부트스트랩·LE 인증서 | 무상태 cloudflared |
| 배포 | 공식 Helm 차트 0.1.0이 RDP 미노출 → 자체 Deployment 필요 | `@pulumi/cloudflare` 6.17 선언 |

전환 근거: 설치 불가 기기에서 접속할 일이 거의 없고(사용자), 용도는 일반 사무. 앱 설치 비용보다 공인 포트 0·원본 RDP·무상태 운영 이점이 크다.

### 확인된 사항

- 클러스터 임시 Pod(`default` ns, alpine `nc`) → `WORKSTATION_MAIN_PC_IP:3389` TCP 도달 (2026-10-18)
- 비용: Zero Trust Free(50 users) + Tunnel 무료 범위. 활성화 시 결제 수단 등록 요구 가능 (미확인)
- 다른 VPN 공존: 데스크톱은 split tunnel·DNS 분담 시 가능, 모바일은 동시 사용 불가 (스펙 §6)

## 이전 결정 (2026-10-16, 폐기)

Warpgate 배스천 + Authentik OIDC. HTTPS UI는 Istio Ingress, RDP는 Direct Gateway TCP, LE 인증서(cert-manager), SQLite PVC. 2026-10-18 차트 조사에서 공식 Helm 차트(0.1.0, app 0.29.0; main 0.2.0도 동일)가 RDP 리스너·Service 포트·Deployment strategy를 노출하지 않음을 확인. 재검토 중 Warpgate가 RDP를 재인코딩하는 프록시라는 점과 공인 포트 노출을 감안해 Cloudflare Zero Trust로 전환.

당시 재개 트리거(대상 Windows 준비)는 2026-10-18 충족.

## RDP 인증서 경고 (결정 2026-10-18)

Windows RDP 기본 자체 서명 인증서(CN = PC 이름)라 클라이언트가 root까지 검증하지 못하고 이름도 `windows.ayteneve93.com`과 다르다. Cloudflare 구성과 무관.

| 안 | 내용 | 판단 |
|---|---|---|
| **A. 클라이언트 "항상 신뢰"** | 기기별로 해당 인증서 신뢰 저장 | **채택** — 사용자 1명·기기 소수 |
| B. Windows에 LE 인증서 (win-acme, DNS-01) | 경고 제거, Windows 측 자동 갱신 | 보류 — IaC 밖 수동 운영. 필요해지면 후속 이슈 |
| C. 내부 CA (Vault PKI) | 클라이언트 CA 신뢰 배포 필요 | 제외 — 과함 |

운영: Windows가 자체 서명 인증서를 재생성하면 경고가 다시 뜬다. 예고 없이 다시 뜨면 인증서 지문이 바뀐 이유를 확인한 뒤 다시 신뢰한다.

## 범위 밖

- Guacamole, Warpgate
- Windows 자격 증명 IaC화
- Authentik 장애 대비 비상 로그인(One-time PIN), group claim 기반 정책, 디바이스 posture — 필요 시 후속 이슈

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-16 | 설계·플랜 작성. Windows 미준비로 이슈 등록·보류. schedule은 트리거 대기 |
| 2026-10-17 | 스펙·플랜 보강: 버전 SSOT(`helmChartVersions`)·`statefulResourceOptions`·Recreate 반영, client_secret Secret 주입·RDP 인증서·TCP Authz 결정 추가, admin 부트스트랩 순서 수정. 상태 변동 없음 |
| 2026-10-17 | RDP/HTTP TLS는 cert-manager(LE prod, `windows` FQDN)로 결정. 스펙 §6·플랜 Task 1/4/7 반영 |
| 2026-10-18 | 트리거 충족: PC IP `WORKSTATION_MAIN_PC_IP` 등록, 클러스터 Pod → `:3389` 도달 실측. 보류 → 진행중 |
| 2026-10-18 | Warpgate 차트 조사: RDP 미노출. 대안 검토 후 Cloudflare Zero Trust(WARP)로 전환. 신규 스펙·플랜 작성, Warpgate 스펙·플랜 폐기 표시. 제목 변경(파일명 유지) |
| 2026-10-18 | Zero Trust Free 활성화, team `apex-captain`, 토큰 권한 추가 및 API 조회 확인. 스펙 §3.6–3.7·플랜 Task 0 갱신 (env 추가 불필요로 변경) |
| 2026-10-18 | Authentik MFA stage·싱글턴 동작 확인(플랜 Task 0). Task 1–7 코드 반영, ESC sync, tools PROD preview +22 create / 변경·삭제 0 |
| 2026-10-18 | tools PROD up(사용자 실행, +22). cloudflared 2/2, 터널 healthy, Cloudflare·Authentik 리소스 API로 확인 |
| 2026-10-18 | 사용자: 외부망에서 Client 등록 후 RDP 접속 성공. 접속 시 "The certificate couldn't be verified back to a root certificate" 경고 (Windows 자체 서명 RDP 인증서, 스펙 §2 예상 동작) |
| 2026-10-18 | RDP 인증서 경고는 A(클라이언트 "항상 신뢰")로 결정. LE 인증서(win-acme)는 필요 시 후속 |
| 2026-10-18 | 사용자: Client OFF 시 `windows` 미해석, Split Tunnel(공인 IP 평소 ISP) 정상. 스펙 §5 수용 기준 체크 (Gateway 로그·허용 밖 계정 실테스트는 선택으로 남김). 상태 적용 |
| 2026-10-18 | 해결. `docs/resolved`로 이동, schedule 행 삭제 |
