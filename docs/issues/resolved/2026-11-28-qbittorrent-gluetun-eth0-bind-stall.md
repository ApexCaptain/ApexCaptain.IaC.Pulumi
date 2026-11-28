# qBittorrent Stall — gluetun eth0 바인드 + killswitch

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-11-28 |
| **영역** | `qbittorrent` / gluetun NordLynx |
| **관련 코드** | `infra/k8s-workstation-tools/src/components/qbittorrent/` |
| **상태** | **해결** |
| **해결일** | 2026-11-28 |

## 해결 요약

gluetun rule 100 + killswitch가 pod eth0 출구 BT를 DROP. qB 5.2는 conf `Session\Interface=tun0`만으로 eth0 리슨이 남아서, `postStart`에서 API `setPreferences(tun0)` 강제 + readiness가 iface/VPN egress/DHT까지 검사. `tools/prod` 배포·Pod 3/3 Ready 확인.

## 배경

VueTorrent에서 신규·기존 토렌트가 전부 Stall, DL/UL 0, peers 0. WebUI는 정상. 사용자는 K8s 1.36 업데이트 의심.

## 문제

- Pod `3/3 Ready`, gluetun `:9999` 200, HTTPS(VPN) OK
- qBit API: `connection_status=firewalled`, `dht_nodes=0`, 전 토렌트 `connections_count≈0`
- 원인: gluetun policy routing `from <pod-eth0-ip> lookup 200` + table 200 `default via eth0`. qBit가 pod eth0 IP로 BT를 바인드하면 killswitch(OUTPUT DROP)에 걸림
- `curl --interface 10.233.64.122` 타임아웃 / `--interface tun0`(또는 `10.5.0.2`) OK — 재현 완료
- K8s 업그레이드 자체는 원인 아님 (11-06 기동 후 한동안 동작). 11-13~18 VPN health flap·재접속 이후 체감

참고: [gluetun discussion #3272](https://github.com/qdm12/gluetun/discussions/3272), [issue #1813](https://github.com/qdm12/gluetun/issues/1813)

## 조치

1. **라이브 (2026-11-28):** `setPreferences` → `current_network_interface=tun0` → 15초 내 `dht_nodes` 96+, `connected`, 업로드 재개
2. **IaC 재발 방지:**
   - LSIO `custom-cont-init.d/50-bind-vpn-tun0.sh` — conf에 `Session\Interface=tun0` (보조)
   - `lifecycle.postStart` → API `setPreferences(current_network_interface=tun0)` — **필수** (qB 5.2는 conf만으로 eth0 리슨이 남음)
   - readiness `torrent-ready.sh` — WebUI + API iface=tun0 + gluetun health + tun0 egress + DHT>0
   - `qmcgaw/gluetun:v3.41.3` SSOT 핀 (`containerImages.gluetun`)

## 수용 기준

- [x] 라이브: transfer `connected|firewalled` + `dht_nodes>0` + 시딩 UL > 0
- [x] `tools/prod` pulumi up — ConfigMap·postStart·readiness·이미지 핀 반영
- [x] 배포 후 Pod Ready, API `current_network_interface=tun0`, DHT>0

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-11-28 | 조사·재현·라이브 tun0 복구. IaC 패치 작성 |
| 2026-11-28 | 1차 up: ConfigMap·readiness 반영. conf만으론 API iface 빈값·eth0 리슨 잔존 → postStart API 강제 추가 |
| 2026-11-28 | 2차 up 성공. Pod 3/3 Ready (~3m). readiness·tun0·DHT 검증 통과 |
