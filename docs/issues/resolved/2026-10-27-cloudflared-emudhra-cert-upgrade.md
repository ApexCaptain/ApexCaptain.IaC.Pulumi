# cloudflared eMudhra 인증서 침해 대응 — 2026.10.2+ 업그레이드

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-27 |
| **영역** | `k8s-workstation-tools` Zero Trust connector (cloudflared Deployment, replicas 2) |
| **관련 코드** | `common/utils/src/configs/versions.config.ts` (`cloudflared`), `infra/k8s-workstation-tools/src/components/zero-trust/zero-trust.connector.component.ts`, `infra/k8s-workstation-tools/src/contract.ts` |
| **상태** | **해결** — cloudflared 2026.10.4 배포, WARP 경유 접속 확인 |
| **해결일** | 2026-10-27 |

## 배경

2026-10-26 Cloudflare 메일 "[Action Required] Upgrade your Cloudflare Tunnel to version 2026.10.2 or later".

- 2026-10-19 eMudhra(emSign) 중간 인증서 8개가 약한 개인키를 쓰는 것으로 확인됨. 키를 얻으면 임의 사이트·서비스를 사칭하는 인증서 발급 가능
- cloudflared 2026.10.2 미만은 이 인증서를 신뢰함. Cloudflare 서비스에서 실제 악용은 확인되지 않음
- 요구: 모든 cloudflared를 2026.10.2 이상으로. Docker/K8s는 새 이미지 pull 후 재배포 (기존 이미지 재시작은 무효)
- 참고: https://blog.cloudflare.com/emudhra-certificate-compromise/

## 현재 상태

- 고정 버전: `cloudflare/cloudflared:2026.10.1@sha256:a15a3b50…` → **대상**
- Deployment `cloudflared`, replicas 2 (`contract.ts`), strategy 미지정 → 기본 RollingUpdate (maxSurge 1, maxUnavailable 0). readiness/liveness 모두 `/ready`
- 터널은 public hostname(ingress) 없이 private route(`/32`)만 사용 (`zero-trust.tunnel.component.ts`). cloudflared가 HTTPS origin에 TLS 검증을 하지 않으므로 "업그레이드 후 eMudhra 체인 origin 거부" 영향 없음 (가설 아님 — ingress 미사용으로 판단)

## 수정안

`versions.config.ts`의 `cloudflared`만 교체. digest는 기존처럼 멀티아치 index digest.

| 후보 | digest (index) | 비고 |
|------|----------------|------|
| 2026.10.3 | `sha256:faa8e0a1475f137c910be6025f43c8e4092fdd35461b31e19fd1390657a1ff39` | 메일이 명시한 이미지 |
| **2026.10.4 (추천)** | `sha256:c6c7ae1d5dfdcb094ad344ed68ccffc26635c9c6be80965664c33baf064b0515` | 2026-10-26 최신. 패치 포함 |

적용 순서:

1. 장기 세션(SSH·WebSocket 등) 정리 — 롤링 중 내려가는 pod의 세션은 grace 30초 후 끊김. WARP 클라이언트 연결 자체는 유지
2. 버전 bump → `k8s-workstation-tools` preview (Deployment image diff 1건만 기대)
3. `up` (사용자 승인 시)
4. 검증: pod 2개 Ready, 이미지 태그 확인, 대시보드 Networking > Tunnels connector 버전 2026.10.4·Healthy, WARP로 private 대상 접속

## 수용 기준

- [x] `versions.config.ts` cloudflared 2026.10.2 이상 + digest 고정
- [x] preview diff가 cloudflared Deployment 이미지 변경뿐
- [x] `up` 후 cloudflared pod 2/2 Ready, connector 버전 확인 (pod 로그 `Version 2026.10.4`, pod당 4개 connection 등록)
- [x] WARP 경유 private 접속 정상

## 범위 밖

- 2026-10-21 메일 "Upgrade to the latest Cloudflare One Client release" — 각 기기의 WARP 클라이언트 업데이트. IaC 대상 아님, 기기별 수동 업데이트
- cloudflared 롤아웃 strategy·PDB 명시 — 필요하면 후속 이슈

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-26 | Cloudflare 업그레이드 요청 메일 수신 |
| 2026-10-27 | 등록. 현재 2026.10.1 확인, 2026.10.4 digest 확보, ingress 미사용으로 origin 인증서 영향 없음 판단 |
| 2026-10-27 | 2026.10.4 bump → preview(Deployment 이미지 1건) → `up` (prod update 255, 롤링 9초). pod 2/2 Ready, 로그 `Version 2026.10.4`, quic 연결 각 4개 등록 |
| 2026-10-27 | 사용자 WARP 클라이언트 업데이트·WARP 경유 접속 확인 완료. 해결 |
