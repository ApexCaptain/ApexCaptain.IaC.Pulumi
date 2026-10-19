# Windows PC WSL에 외부 SSH 접속 (Cloudflare Zero Trust 경유)

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-18 |
| **영역** | `infra/k8s-workstation-tools` Zero Trust Gateway, 대상 Windows PC(WSL) |
| **관련 코드** | `infra/k8s-workstation-tools/src/components/zero-trust/zero-trust.gateway.component.ts`, `infra/k8s-workstation-tools/src/contract.ts` (`zeroTrustGateway` targets) |
| **관련 이슈** | [외부 RDP Zero Trust (해결)](../resolved/2026-10-16-warpgate-authentik-rdp.md) |
| **상태** | **해결** |
| **해결일** | 2026-10-19 |

## 배경

외부 RDP는 Cloudflare Zero Trust(WARP + cloudflared + Authentik MFA)로 해결했다. 같은 PC에 WSL을 설치하고, 외부에서 WARP를 켠 상태로 `ssh -p <포트> <user>@windows.ayteneve93.com`으로 접속하려 한다.

## 현재 상태

그대로 쓸 수 있는 것 (포트 무관):

- Gateway DNS override: `windows.ayteneve93.com` → PC IP
- 터널 private route `PC IP/32`, Split Tunnel Include `/32`
- cloudflared: 임의 TCP 전달

막히는 것:

- Gateway network 정책이 `PC IP:3389`만 allow하고, 다음 precedence에서 `PC IP` 나머지 포트를 block한다. SSH 포트는 지금 차단된다.
- WSL2 기본 NAT 네트워크에서는 WSL 안 sshd가 Windows IP로 노출되지 않는다.

## 접근 비교 (Windows·WSL 측)

| 안 | 내용 | 비고 |
|---|---|---|
| **WSL mirrored 네트워킹** | `.wslconfig` `[wsl2] networkingMode=mirrored`, WSL 안 sshd, Windows 방화벽 + Hyper-V 방화벽 inbound 허용 | Windows 11 22H2+. portproxy 불필요 |
| portproxy | `netsh interface portproxy` Windows 포트 → WSL IP | WSL IP가 재부팅마다 바뀌어 갱신 스크립트 필요 |
| Windows OpenSSH Server | Windows sshd, 기본 셸 `wsl.exe` | WSL 네트워크 설정 불필요. Windows 계정으로 인증 |

**추천:** mirrored 네트워킹. 포트는 22를 피한다 (Windows OpenSSH 등과 충돌 가능성 — 사용자 의견). 예: `2222`, 최종 값은 미정.

## 계획 (재개 시)

1. (사용자) WSL 설치, 위 방식 중 하나로 sshd 노출. 키 기반 인증, 비밀번호 로그인 비활성 권장 (네트워크 앞단은 Authentik MFA)
2. 클러스터 임시 Pod에서 `PC IP:<포트>` TCP 도달 실측 (RDP 때와 동일 방식)
3. IaC: Gateway target을 단일 `port` → `ports: number[]`로 바꾸고 allow traffic을 `net.dst.port in {3389 <포트>}`로. 예상 preview: allow 정책 1건 update
4. (사용자) tools PROD `pulumi up`
5. 외부망 WARP ON → `ssh -p <포트> <user>@windows.ayteneve93.com`. WARP OFF 시 실패 확인

## 재개 트리거

- [x] WSL 설치·sshd 노출 방식 결정 및 설정 — mirrored, sshd `Port 8022`
- [x] SSH 포트 확정 — `8022` (대상 IP는 기존 `workstationMainPcIp` 그대로)

## 수용 기준

- [x] 외부망에서 WARP ON 상태로 SSH 접속 성공
- [x] WARP OFF 또는 허용 목록 밖 identity는 접속 불가
- [x] 공인 inbound 포트 신규 개방 없음
- [x] RDP 접속 기존과 동일하게 동작

## 범위 밖

- SSH 인증서·Vault SSH CA 연동 (필요 시 후속 이슈)
- WSL 외 다른 LAN 대상 추가

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-18 | 등록. WSL·sshd 설정과 포트 미정으로 보류 |
| 2026-10-19 | WSL Ubuntu·sshd 설치, 키 인증만 허용. portproxy로 8022 노출. Windows 로컬에선 열리나 LAN 다른 기기에서 실패 — 방화벽·listenaddress·WSL IP 변동 확인 중, mirrored 전환 검토 |
| 2026-10-19 | 원인: 네트워크 프로필 Public + 8022 inbound 규칙 없음. 방화벽 규칙(TCP 8022, Any) 추가, 프로필 Private 전환. 개발 컨테이너에서 `ssh -p 8022 ayteneve93@<PC IP>` 키 인증 성공 (WSL systemd, ssh enabled, PasswordAuthentication no). portproxy `0.0.0.0:8022 → WSL IP:22`는 WSL IP 변동 시 끊김 — mirrored 전환 또는 갱신 스크립트 미정 |
| 2026-10-19 | 결정: portproxy 유지 (노출 포트를 명시한 것만으로 제한). 작업 스케줄러(시작 시)로 WSL keepalive + 60초마다 WSL eth0 IP 확인 후 portproxy 갱신. mirrored는 Hyper-V 방화벽 기본값에 노출 범위가 좌우돼 보류. 포트 8022 유지 (22는 Windows OpenSSH 충돌 여지) |
| 2026-10-19 | 정정: 직전 행의 portproxy 유지 결정 취소. **mirrored 전환**으로 진행 — portproxy 삭제, Hyper-V 방화벽 기본 Block 유지 + TCP 8022만 허용, WSL sshd `Port 8022`(ssh.socket). WSL keepalive는 별도 |
| 2026-10-19 | mirrored 적용 확인: WSL eth0 = PC IP, sshd `0.0.0.0:8022` listen, 개발 컨테이너에서 키 인증 SSH 성공. Hyper-V 방화벽 `DefaultInboundAction=Block`, `AllowHostPolicyMerge=True` |
| 2026-10-19 | WSL 자동 시작은 의도적으로 안 함 (PC 다른 용도 겸용, 필요 시 RDP로 들어가 WSL 실행). Pod→PC:8022 도달 확인 (개발 환경이 Coder Pod). Gateway target `port` → `ports: [3389, 8022]`, allow traffic `net.dst.port in {...}`. tools PROD `pulumi up --target` allow 정책 1건만 update — 같은 preview의 teamName ESC 이관(값 동일, secret 전환) 9건과 description 변경은 별도 작업이라 제외 |
| 2026-10-19 | 외부망 확인: WARP ON SSH 성공, WARP OFF 실패, RDP 정상. 해결 |
