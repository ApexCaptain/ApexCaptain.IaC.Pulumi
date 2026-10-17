# Warpgate + Authentik RDP 게이트웨이 (Windows 준비 대기)

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-16 |
| **영역** | `infra/k8s-workstation-tools`, Direct Gateway, Cloudflare `windows`, Authentik OIDC |
| **관련 문서** | [설계 스펙](../superpowers/specs/2026-10-16-warpgate-authentik-rdp-design.md), [구현 플랜](../superpowers/plans/2026-10-16-warpgate-authentik-rdp.md) |
| **상태** | **보류** — 연결 대상 Windows PC 미준비. 일정 없음 (트리거 대기) |

## 배경

외부에서 LAN Windows로 RDP할 때 `:3389` 직접 노출 없이, 네이티브 `mstsc` + Authentik MFA가 필요하다. Guacamole(웹 HTML5)는 UX·성능 요구와 맞지 않아 제외했다. Warpgate 배스천 + Authentik OIDC로 가기로 설계·플랜까지 작성했다.

## 문제 / 현재 상태

구현·배포를 진행하려면 Warpgate target이 될 **Windows PC**(원격 데스크톱·NLA·방화벽·고정 내부 IP, 클러스터에서 `:3389` 도달)가 준비되어야 한다. 지금은 대상 머신이 없어 IaC 착수·검증을 보류한다. 구체 일정은 없다.

## 목표 (재개 시)

- DNS `windows.ayteneve93.com` (DNS-only)
- Warpgate (HTTP UI + RDP) in `k8s-workstation-tools`
- Authentik OIDC (`/@warpgate/api/sso/return`)
- Istio Ingress (HTTPS) + Direct Gateway TCP (RDP)
- 외부 `mstsc` → MFA 승인 → LAN Windows RDP

상세·수용 기준·태스크는 위 스펙·플랜 SSOT.

## 재개 트리거

다음이 준비되면 플랜 Task 1부터 착수한다.

- [ ] 대상 Windows PC 확보 (내부 IP 확정)
- [ ] 원격 데스크톱·NLA 활성
- [ ] 방화벽이 클러스터 Pod/노드 CIDR에서 `:3389` 허용
- [ ] (선택) 클러스터에서 해당 IP:3389 TCP 실측 통과

## 범위 밖

- Guacamole
- Windows target IP/비밀번호 IaC화 (1차는 Admin UI)
- 일정 확정 전 강제 배포

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-16 | 설계·플랜 작성. Windows 미준비로 이슈 등록·보류. schedule은 트리거 대기 |
