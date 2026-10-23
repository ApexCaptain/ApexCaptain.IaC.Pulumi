# 라우터 재부팅 시 링크 끊김으로 컨트롤러 일제 재시작

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-23 |
| **영역** | `workstation-0` 호스트 네트워크 (`enp34s0`, systemd-networkd), etcd·kube-apiserver, 리더 선출 컨트롤러 전반 |
| **관련 코드** | `ansible/workstation/roles/network-carrier-loss/`, `ansible/workstation/pre-configure.yml` |
| **상태** | **진행중** — 원인 확정, 라우터 재부팅 주 1회(월요일)로 축소, Ansible 롤 작성. 노드 적용·실검증 전 |

## 증상

2026-10-23 클러스터 점검에서 리더 선출을 쓰는 파드가 같은 시각에 일제히 재시작한 흔적.

- 대상: cert-manager·cainjector, VSO, gpu-operator, CNPG operator, cilium-operator, snapshot-controller, redis-operator, Longhorn CSI 사이드카, kube-vip, kube-controller-manager, kube-scheduler
- 종료 사유: `leader election lost` / `leaderelection lost`
- 누적 재시작 예: kube-vip 35회(11일), VSO 37회, gpu-operator·CNPG operator 28회(10일)
- [K8s 1.36 업그레이드](2026-10-13-kubernetes-1-36-upgrade.md) 이슈에서 "리더 선출 노이즈로 추정, 미확인"으로 남겨 둔 재시작 수(controller-manager 116, scheduler 124)와 같은 현상

## 원인

라우터 자동 재부팅으로 노드 NIC 링크가 약 1분 끊기고, systemd-networkd 기본 동작(carrier loss 시 주소 제거)으로 노드 IP가 인터페이스에서 빠진다. apiserver는 etcd에 노드 IP(`<노드IP>:2379`)로 붙어 있어 같은 호스트 안 통신도 끊긴다. lease 갱신(5초 타임아웃)이 실패해 리더 선출 컨트롤러가 일제히 종료·재시작한다.

2026-10-23 07:00 KST 타임라인 (호스트 journal + Loki):

| 시각 (KST) | 내용 |
|---|---|
| 07:00:07 | `r8169 enp34s0: Link is Down`, networkd `Lost carrier` |
| 07:00:09 | ntpd가 노드 IP·kube-vip VIP 주소 삭제 기록 (주소 제거 확인) |
| 07:00:11 | apiserver `etcd-client` `retrying of unary invoker failed` 시작 |
| 07:00:15~07:00:27 | 링크 Up/Down 2회 더 반복 |
| 07:00:18 | kube-controller-manager `leaderelection lost` |
| 07:01:11 | 링크 안정 |
| 07:01:2x | etcd 오류 종료. 07:01:46 kube-vip 재기동·VIP 재확보 |

같은 07:00 KST 패턴: 10-16, 10-18, 10-22, 10-23 (apiserver 로그 기준). 업그레이드(10-21) 전부터 발생.

## 배제한 가설

| 가설 | 근거 |
|---|---|
| K8s 1.35.9 업그레이드 | 업그레이드 전(10-16, 10-18)에도 동일 |
| etcd 디스크 지연 | `slow fdatasync` 없음, 직전 compaction 105ms |
| CPU·메모리 압박 | 노드 CPU 1.2~2코어, working set ~13Gi로 평시 |
| Longhorn 디스크 | VictoriaMetrics fsync 평균 ~3ms 평시 |
| K8s CronJob·Longhorn RecurringJob·CNPG 백업 | 07:00 KST 스케줄 없음 |
| apt-daily / unattended-upgrades | 06:15에 종료 |
| 호스트 cron·systemd timer | 07:00 정각 항목 없음 (`sysstat-collect`는 1초 내 종료) |

## 조치

1. 라우터 자동 재부팅을 매주 월요일 07:00 1회로 축소 (2026-10-23, 사용자)
2. `network-carrier-loss` 롤: netplan이 만든 `.network`에 drop-in `IgnoreCarrierLoss=yes` 추가. 링크가 끊겨도 IP 유지 → 호스트 내부 apiserver↔etcd 통신 유지
   - netplan YAML은 수정하지 않음. `networkctl status`의 `Network File`을 찾아 `/etc/systemd/network/<file>.d/50-ignore-carrier-loss.conf` 작성
   - 적용: `pnpm ansible:preConfigure --tags network-carrier-loss` (핸들러가 `networkctl reload` 실행)

외부 통신(cloudflared 등)은 라우터 재부팅 동안 어차피 끊긴다. 범위 밖.

## 수용 기준

- [ ] 노드에 롤 적용, `networkctl cat enp34s0`에 `IgnoreCarrierLoss=yes` 확인
- [ ] 다음 라우터 재부팅(월요일 07:00 KST) 이후 apiserver `etcd-client` 오류 없음 (Loki `{service_name="kube-apiserver"} |= "etcd-client"`)
- [ ] 같은 시각 리더 선출 컨트롤러 재시작 증가 없음

## 별도 관찰 (범위 밖)

- 커널 로그에 5초마다 `apparmor="DENIED" operation="signal" comm="vault"` (cri-containerd 프로파일). vault exec probe 종료 신호로 추정. 기능 영향 미확인 — 필요 시 별도 이슈
- `systemd-networkd-wait-online` 타임아웃으로 apt-daily 계열이 매번 오류 코드 기록

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-23 | 등록. 클러스터 점검 중 07:00 KST 일제 재시작 발견 → Loki·VictoriaMetrics·호스트 journal로 라우터 재부팅 링크 끊김 확정. 라우터 재부팅 월요일만으로 변경. `network-carrier-loss` 롤 작성 (노드 미적용) |
