# Sysbox 대체 런타임 선정

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-24 |
| **영역** | Coder 워크스페이스 런타임 (`sysbox-runc` RuntimeClass), `workstation-0` 호스트 |
| **관련 코드** | `ansible/workstation/roles/install-sysbox-runc/`, `ansible/workstation/inventory/group_vars/all/all.yml` (`sysbox_ce_version`), `infra/k8s-workstation-system/src/components/sysbox/`, `infra/k8s-workstation-tools/src/components/coder/`, `infra/k8s-workstation-tools/assets/coder/sysbox-ubuntu/`, `infra/k8s-workstation-tools/assets/coder/kata-ubuntu/`, `infra/k8s-workstation-system/src/components/kata/` |
| **상태** | **조사중** — PoC 1~4단계 검증, I/O·메모리 대책과 Cilium ClusterIP 해결 적용. Kata 템플릿 전용 네임스페이스 + 사이드카 적용·실제 워크스페이스 검증 완료. Kata production 템플릿(`coder-kata-ubuntu`) 추가. 남은 것: Sysbox 기동 비교. 결과 정리는 2026-12 초 |

## 배경

[K8s 1.36 업그레이드](2026-10-13-kubernetes-1-36-upgrade.md)의 Phase 2가 Sysbox 1.36 지원 대기로 막혀 있다. 그 이슈의 범위 밖 항목 "Sysbox 대체 런타임 선정·이전"을 분리한 것. 1.35는 maintenance 2026-12-28, EOL 2027-02-28.

## 현재 상태

- Sysbox CE 0.7.0을 호스트에 deb로 설치 (Ansible, `sysbox-deploy-k8s` 미사용). 최신은 0.7.1 (7/31)
- RuntimeClass `sysbox-runc`, node label `sysbox-runtime=running`
- Coder 템플릿 `sysbox-ubuntu` (main / test) 워크스페이스가 이 런타임으로 돈다. 내부 Docker(devcontainer) 사용
- containerd 2.3.5, 단일 노드, 사용자 1명 (홈랩)

## 문제

Sysbox 유지보수 신호가 약하다 (2026-10-24 조사).

| 근거 | 내용 |
|---|---|
| 공식 지원 범위 | install-k8s 문서: 1.32~1.35만. "Other versions … are not supported" |
| 릴리스 주기 | v0.7.0(6/2)에 1.33~1.35 일괄 추가, v0.7.1(7/31)은 범위 변경 없음. 지원 추가가 K8s 마이너 주기(4개월)보다 느리다 |
| 메인테이너 응답 | 1.36 관련 #1031(8/6), containerd v2 ETA·신규 버전 지원 Discussions 무응답 |
| 커뮤니티 결과 | 비공식 성공 1건 (fleet-kit #365: 0.7.1 + K8s 1.36.4 + containerd 2.3.6, installer config 수동 수정), 실패 보고 1건 (#1031, AKS) |

K8s 마이너 업그레이드마다 Sysbox 대기·도박이 반복된다.

## 목표

K8s 버전 업그레이드를 런타임 지원 여부에 묶지 않는다. 워크스페이스 안 Docker(devcontainer)는 지금처럼 동작한다.

## 접근 비교

판단 기준: 단일 사용자 홈랩이라 격리 강도보다 **유지보수 부담·K8s 버전 독립성**이 우선.

| 대안 | 장점 | 단점 | 판단 |
|---|---|---|---|
| **Kata Containers** | CNCF, 활발. RuntimeClass로 붙어 K8s 버전에 덜 묶임. 경량 VM이라 Docker·systemd 제약 없음. 기존 RuntimeClass 패턴 유지 → 템플릿은 `runtimeClassName` 교체 중심 | 워크스페이스당 VM 메모리 오버헤드. GPU 패스스루 복잡 | **추천 (주력)**. 호스트 AMD 베어메탈, SVM 있음 |
| privileged DinD | 가장 단순, 버전 무관 | 사실상 호스트 root. 격리 없음 | **폴백**. 단일 사용자라 감수 가능 |
| user namespaces(`hostUsers: false`) + rootless Docker | K8s 네이티브(1.36 GA), 보안상 이상적 | 파드 안 systemd·overlay·중첩 userns 마찰. privileged 조합 가능 여부 미확인 | 보류. 개발 워크스페이스엔 아직 마찰 큼 |
| Sysbox 유지 (미지원 버전 강행) | 당장 할 일 없음 | 깨져도 upstream 수정 없음. 업그레이드마다 도박 | 1.36 전환 시기 맞추기용 브리지로만 |

## 추천

1. 지금 ~ 2026-12: 1.35 유지. Sysbox 0.7.0 → 0.7.1. Kata PoC
2. 2027-01-15: Sysbox 1.36 지원 확인 ([업그레이드 이슈](2026-10-13-kubernetes-1-36-upgrade.md) 일정)
   - 지원 O: 1.36 진행. PoC가 좋으면 Kata 이전은 계속 (다음 마이너에서 같은 문제 반복)
   - 지원 X: Kata 이전 후 1.36. PoC 실패 시 privileged DinD
3. 결정 전 확인할 것 → 2026-10-24 확정
   - GPU: **안 씀** (사용자). Kata 감점 요인 없음
   - systemd: **불필요**. 현재 템플릿 PID 1은 `sh -c`(`infra/k8s-workstation-tools/assets/coder/sysbox-ubuntu/main/main.tf`), dockerd는 `coder_script` `run-dockerd`가 `sudo dockerd`로 직접 기동(`main/scripts.tf`). `systemctl` 사용 없음
   - 따라서 userns(`hostUsers: false`) 안을 2순위 PoC로 올린다. 단 비privileged userns 파드에서 rootful dockerd(mount·overlay·iptables)가 뜨는지가 관건. Kata는 현재 스크립트 그대로 가능해 주력 유지

## Kata 트레이드오프

2026-10-24 정리. 현재 템플릿(`infra/k8s-workstation-tools/assets/coder/sysbox-ubuntu/main/main.tf`) 기준.

### 얻는 것

| 항목 | 내용 |
|---|---|
| K8s 버전 독립 | kubelet이 아니라 containerd shim에 붙는다. K8s 마이너 업그레이드가 런타임 지원 대기에 묶이지 않음 (이 이슈의 목표) |
| 기존 도구로 관리 | Kubespray에 `container-engine/kata-containers` 롤 있음 (`kata_containers_enabled`). 별도 롤·kata-deploy 없이 containerd 설정까지 위임 가능 |
| 내부 Docker 자연스러움 | 게스트 커널이 따로 있어 rootful dockerd·iptables·overlay가 일반 서버처럼 동작. `run-dockerd` 스크립트 그대로 |
| lxcfs 불필요 | VM 커널이 자기 자원을 보여 줌. lxcfs `/proc/*` 마운트 5개 제거 가능 |
| 격리 강화 | userns → VM 경계. 홈랩이라 부차적 |
| 메시 영향 없음 | 워크스페이스 파드가 `istio.io/dataplane-mode: none` |

### 잃는 것·바꿔야 하는 것

| # | 항목 | 영향 | 대응 |
|---|---|---|---|
| ① | `/var/lib/docker` I/O | 현재 Longhorn 파일시스템 PVC. Kata에선 virtio-fs 공유가 되는데 overlay2 on virtio-fs는 미지원·`vfs` 폴백 가능성 높음. **최대 위험** | docker PVC `volumeMode: Block`으로 블록 장치 직결, 시작 스크립트에서 포맷·마운트. 기존 docker 캐시 재생성 |
| ② | home·data I/O | `/home/coder`, `/home/coder/data`도 virtio-fs 경유. 작은 파일 많은 작업(`pnpm install`)에서 체감 가능 | PoC 실측. 느리면 Block 검토 |
| ③ | 메모리 효율 | VM 페이지 캐시가 호스트 사용량으로 잡히고 반환이 느림. 현재 request = limit/4 과할당 이득 감소 (노드 45Gi). VM 고정 오버헤드(게스트 커널·에이전트, 대략 100~200MiB) | RuntimeClass `overhead` 설정, 워크스페이스 메모리 파라미터 재조정 |
| ④ | FUSE 장치 | 템플릿이 `squat.ai/fuse` 장치 요청. 호스트 `/dev/fuse` VM 전달은 무의미 | Kata 변형에선 요청 제거, 게스트 FUSE 사용. FUSE 사용처 먼저 확인 |
| ⑤ | Cilium Service 접근 | kube-proxy replacement의 소켓 단계 LB가 VM 안 소켓엔 안 걸리는 것으로 알고 있음 → ClusterIP가 tc 단계 처리에 의존, 클러스터 전체 Cilium 설정 변경 필요할 수 있음 (**미확인**) | PoC 첫 단계에서 워크스페이스 → `coder.coder.svc`·Vault 접근 확인 |
| ⑥ | 기동 시간 | VM 부팅만큼 수 초 증가 | 워크스페이스 용도라 영향 작음 |
| ⑦ | 관측 지표 | 파드 메트릭이 VM 단위. 페이지 캐시로 VPA·Goldilocks 추천 부풀 수 있음 | 워크스페이스는 VPA 판단에서 분리 |
| ⑧ | 운영 런타임 수 | 이전 기간 Sysbox·Kata 병행. Kata 버전은 Kubespray 고정 버전에 묶임 | Sysbox 제거 후 다시 하나 |

### 템플릿 변경 범위

`runtimeClassName`은 이미 변수(`var.runtime_class_name`). 실제 변경: docker PVC Block + 마운트 스크립트, lxcfs 마운트 제거, FUSE 요청 제거, RuntimeClass overhead 반영.

## PoC 기록

### 2026-10-31 설치

| 항목 | 내용 |
|---|---|
| etcd 스냅샷 | `tmp/snapshots/etcd-pre-kata-20261031-102905/` (revision 92180562, 2873 keys, 173 MB, sha256 노드 원본과 일치). 노드 원본 `/tmp/etcd-pre-kata-20261031-102905.db` |
| Sysbox | 0.7.0 → 0.7.1 (`pnpm ansible:preConfigure --tags install-sysbox-runc`, 태그 신설). 실행 중 sysbox 워크스페이스 0개 상태에서 적용 |
| Kata | Kubespray `cluster.yml --tags container-engine`. Kata 3.32.0 (`/opt/kata`), containerd 핸들러 `kata-qemu`, containerd 2.3.5 유지. `kata_containers_qemu_default_memory: 2048` (기본값이 호스트 전체 메모리라 고정). `kata-runtime check` 통과 |
| RuntimeClass | `kata` → handler `kata-qemu`, overhead 250m / 160Mi (업스트림 예시값). `infra/k8s-workstation-system/src/components/kata/` |
| 호스트 | KVM(`kvm_amd`)·`/dev/vhost-vsock` 있음, 16코어, 45Gi, Ubuntu 26.04, 커널 7.0 |
| 게스트 | 커널 6.18.35, MemTotal ≈ 1.9Gi (default_memory 2048) |

### 2026-10-31 PoC 1단계 — ClusterIP 접근 실패 (⑤ 확정)

`default` 네임스페이스 임시 파드(curl, 5초 타임아웃)로 runc와 비교.

| 대상 | runc | kata |
|---|---|---|
| vault ClusterIP `:8200/v1/sys/health` | 200 | timeout |
| coredns ClusterIP TCP 53 | 연결됨 | timeout |
| coder Pod IP 직접 | reset (메시 쪽 거부로 추정, runc도 동일) | reset |
| 외부 `https://1.1.1.1` | 301 | 301 |
| DNS (nodelocaldns 169.254.25.10) | — | 정상 |

원인: Cilium 1.20.2 KPR `Socket LB Coverage: Full`. 소켓 LB가 파드 netns에서 `connect()`를 가로채 번역하고, 그 경우 tc 단계 서비스 조회를 하지 않는다. Kata는 게스트 커널 소켓이라 호스트 cgroup 훅에 안 걸려 ClusterIP가 번역되지 않는다. Cilium 문서가 Kata·KubeVirt·gVisor에 `socketLB.hostNamespaceOnly=true`(파드 netns는 tc LB로 폴백)를 안내한다.

적용 경로: Kubespray `cilium_extra_values: { socketLB: { hostNamespaceOnly: true } }` → network 단계 재실행(Cilium agent 재시작). **클러스터 전체 파드의 서비스 datapath가 바뀐다** (소켓 LB → tc LB). Istio ambient·Jellyfin 등 영향 확인 필요.

### 2026-10-31 방향 — Cilium 변경 보류, 2단계 먼저

1단계는 "ClusterIP 불가 / 외부 도메인 경로 가능"으로 기록하고 Cilium `socketLB.hostNamespaceOnly`는 보류 (사용자 결정). 워크스페이스는 Coder(`CODER_ACCESS_URL`)·Vault(`vault_addr`) 모두 외부 도메인(ingress)으로 붙어 ClusterIP 없이 동작한다. Kata 파드에서 Coder 도메인 200, Vault 도메인 200 (파드·중첩 컨테이너 모두).

ClusterIP에 의존해서 Kata에서 안 되는 것: 메시 SOCKS5 프록시 `coder-workspace-mesh-proxy` (ClusterIP, `CODER_MESH_SOCKS5_PROXY_*`), 워크스페이스 안에서 클러스터 내부 Service 직접 호출.

### 2026-10-31 containerd 핸들러 `kata` 추가

dockerd는 privileged가 필요하다. Kata는 privileged 파드에 호스트 `/dev` 전체를 VM으로 넘기므로 `privileged_without_host_devices = true`가 필요한데, Kubespray 내장 `kata-qemu` 섹션과 `containerd_additional_runtimes`는 이 키를 지원하지 않는다. `containerd_extra_args`(config.toml 최상위, `[grpc]` 앞에 그대로 삽입)로 핸들러 `kata`를 따로 정의하고 RuntimeClass `kata`의 handler를 `kata-qemu` → `kata`로 교체 (handler immutable → `replaceOnChanges`·`deleteBeforeReplace`). 렌더 결과는 호스트 config.toml에 끼워 `tomllib`로 파싱 확인 후 적용.

### 2026-10-31 PoC 2단계 — 파드 수준 통과

`default` 임시 파드: `runtimeClassName: kata`, privileged, Longhorn `longhorn-ssd` 10Gi `volumeMode: Block` → `volumeDevices` `/dev/docker-disk`.

| 항목 | 결과 |
|---|---|
| 게스트 블록 장치 | `sda`로 보임. `mkfs.ext4` → `mount -t ext4` 성공, ext4 위 overlay 마운트 성공 |
| dockerd | storage-driver **overlay2**. `hello-world` 성공 |
| 빌드 | `ubuntu:26.04` + `apt-get install curl` 25초 |
| 중첩 컨테이너 네트워크 | Vault 도메인 200 |
| 게스트 메모리 | limit 4Gi 파드에서 MemTotal ≈ 5.9Gi (default_memory 2Gi + limit hotplug) |

시행착오: `docker:dind`(alpine)엔 `mkfs.ext4`가 없어 포맷 없이 mount → `Invalid argument` → `vfs` 폴백. 워크스페이스 스크립트는 `mkfs.ext4` 없으면 `e2fsprogs` 설치.

### test 템플릿 Kata 변형

`infra/k8s-workstation-tools/assets/coder/sysbox-ubuntu/test/`에 파라미터 `runtime`(sysbox 기본 / kata, 생성 후 변경 불가) 추가. kata일 때만:

- `runtimeClassName` = `kata_runtime_class_name` 변수 (tools contract가 system `kata.runtimeClassName` 주입), `hostUsers` 생략
- 컨테이너 `privileged: true`
- docker PVC `volumeMode: Block` + `volumeDevices` `/dev/docker-disk`, `run-dockerd`에서 첫 기동 포맷·마운트
- lxcfs 마운트 5개·`squat.ai/fuse` 요청 제거

기존 sysbox 동작은 변화 없음 (파라미터 기본값). docker PVC `volume_mode`는 `ignore_changes`라 **새 워크스페이스**로 만들어야 한다.


**2026-10-31 변경 — 별도 템플릿으로 분리.** `sysbox-ubuntu/test`의 `runtime` 파라미터는 롤백하고 (HEAD 상태로 복원, 기존 Sysbox test 워크스페이스는 사용자가 삭제), 새 템플릿 **Ubuntu on Kata (Test)** (`kata-ubuntu-test-template`, `infra/k8s-workstation-tools/assets/coder/kata-ubuntu/test/`)를 만들었다. 내용은 위 kata 분기를 무조건 적용한 것(Block docker PVC + 포맷·마운트, privileged, lxcfs·FUSE 제거, `hostUsers` 생략). 네임스페이스·메시 프록시는 `coder-sysbox-ubuntu-test`를 같이 쓴다 (새 네임스페이스는 Coder Helm RBAC·AuthorizationPolicy까지 바뀌어서 PoC에선 피함).
### 2026-10-31 실제 Kata 워크스페이스 (test 템플릿, CPU 2 / 메모리 4Gi)

| 항목 | 결과 |
|---|---|
| 기동 | 스케줄 → 컨테이너 시작 15초. 재시작 0 |
| 마운트 | `/var/lib/docker` = `/dev/docker-disk` ext4, `/home/coder` = virtiofs |
| dockerd | Docker 29.7.1, containerd 이미지 저장소(`io.containerd.snapshotter.v1` overlayfs). 스냅샷은 `/var/lib/docker/containerd/daemon/` → 블록 디스크 위 |
| devcontainer | `base:ubuntu-24.04` + node feature, `devcontainer up` 콜드 86초 성공. node 22 동작 |
| coder agent·devcontainer CLI | 정상 |
| FUSE | 게스트 커널은 fuse 지원, `/dev/fuse` 노드 없음 (host devices 미전달). 필요 시 스크립트에서 `mknod` 검토 |

### 2026-10-31 PoC 3단계 — 홈 I/O

`pnpm install` (next·react·typescript·eslint·aws-sdk·jest 등, 파일 19,451개). store를 같은 디렉터리에 두고 콜드(네트워크) → `node_modules` 삭제 후 `--offline`(로컬 I/O) → 삭제. 각 2회, ms.

| 위치 | offline | rm |
|---|---|---|
| 임시 파드 runc, Longhorn SSD PVC | 922 / 1547 | 1009 / 1029 |
| 임시 파드 sysbox-runc, PVC | 1241 / 2088 | 1342 / 2176 |
| 임시 파드 kata, PVC (virtiofs) | 3793 / 3310 | 5879 / 6240 |
| 임시 파드 kata, 컨테이너 rootfs (이것도 virtiofs) | 3665 / 3708 | 6444 / 6659 |
| Kata 워크스페이스 devcontainer, 워크스페이스 폴더 바인드 (virtiofs) | 1989 / 2247 | 4718 / 4716 |
| Kata 워크스페이스 devcontainer, 컨테이너 내부 (블록 ext4) | 742 / 776 | 557 / 498 |

결론: virtiofs 경로는 Sysbox PVC 대비 offline 설치 약 2배, 삭제 약 3~4배 느리다. devcontainer 내부(블록 디스크)는 runc와 같은 수준. 콜드 수치는 네트워크 편차가 커서 비교에서 뺀다. 개선 후보: home도 Block (트레이드오프 ②), `kata_containers_virtio_fs_cache`·DAX 조정, `node_modules`를 볼륨으로 분리.

### 2026-10-31 PoC 4단계 — 메모리·기동 (1차)

| 항목 | 결과 |
|---|---|
| 게스트 | MemTotal 6016Mi (default 2Gi + limit 4Gi hotplug). used 438Mi, buff/cache 2842Mi |
| 호스트 | `qemu-system-x86_64` RSS 4672Mi + `virtiofsd` RSS 2022Mi ≈ **6.7Gi** |
| kubelet 집계 | `kubectl top` 1255Mi, request 1Gi + overhead 160Mi |

트레이드오프 ③ 확인: 게스트 페이지 캐시가 호스트 메모리로 잡혀 반환되지 않고, kubelet 집계·request보다 실사용이 5배 이상 크다. 워크스페이스 여러 개면 노드(45Gi) 과할당 위험. 대응 후보: request를 limit에 가깝게, virtio-balloon/free page reporting, `default_memory` 축소, overhead 상향.

기동: 실제 워크스페이스 15초. 임시 파드 3개를 동시에 띄운 측정(sandbox 준비 runc 63초 / sysbox 62초 / kata 145초)은 Longhorn attach가 겹쳐 신뢰도 낮음. 다시 잰다.

### Kata 전면 전환 시 제거 가능한 구성요소 (2026-10-31 확인)

Sysbox 워크스페이스를 모두 Kata로 옮기고 Sysbox를 제거하면 아래 두 컴포넌트도 필요 없어진다. 제거는 이전 완료 후 별도 이슈.

| 컴포넌트 | 현재 용도 | 다른 사용처 | Kata에서 |
|---|---|---|---|
| generic-device-plugin (`infra/k8s-workstation-system/src/components/generic-device-plugin/`) | 호스트 `/dev/fuse`를 `squat.ai/fuse`(count 10)로 노출. 노출 장치는 fuse 하나 | 코드: `sysbox-ubuntu/main`·`test` 템플릿의 `device_plugin_fuse_*`만. 라이브: `squat.ai/*` 요청 파드 0개 | 불필요. 게스트 커널 장치를 `mknod /dev/fuse c 10 229`로 만들어 씀 (Kata 템플릿 시작 명령). 개수 할당 불필요 |
| lxcfs (`infra/k8s-workstation-system/src/components/lxcfs/`) | `/proc/meminfo`·`cpuinfo`·`stat`·`loadavg`·`uptime`을 컨테이너 limit 기준으로 보여 줌 | 코드: `sysbox-ubuntu` 템플릿 hostPath 마운트만. webhook은 파드 라벨 `platform.glm.ai/mount-lxcfs=enabled` opt-in인데 쓰는 파드 0개 (라이브 확인: lxcfs hostPath 마운트 파드는 lxcfs DaemonSet 자신뿐) | 불필요. 게스트 커널이 VM 자원을 보여 줌 |

FUSE 검증 (임시 Kata 파드, privileged): `/dev/fuse` 없음 → mknod 성공 → `rclone mount :memory:` root·일반 사용자 모두 읽기·쓰기 정상 (`fuse.rclone`). 일반 사용자 `fusermount3 -u`는 `/etc/mtab` 없어서 실패 → 템플릿에서 `/proc/self/mounts` 링크.

lxcfs 대체 정도: 실제 Kata 워크스페이스(CPU 2 / 메모리 4Gi)에서 `nproc` = 2로 limit과 일치. `/proc/meminfo` MemTotal은 6016Mi로 limit(4Gi)이 아니라 VM 메모리(`default_memory` 2Gi + limit hotplug)를 보여 준다. `free`·htop이 limit보다 2Gi 크게 보이는 차이는 있다 (실제 제한은 게스트 cgroup이 4Gi로 건다). `kata_containers_qemu_default_memory`를 줄이면 차이가 준다.

### 2026-10-31 I/O·메모리 대책 실험

Kata는 `configuration-qemu.toml` 옆 `config.d/*.toml`을 합쳐 읽는다 (드롭인에 `default_memory = 1024` → 게스트 MemTotal 1.9Gi로 확인). 샌드박스 생성 시 읽으므로 containerd 재시작 없이 새 파드부터 반영되고, Kubespray `cluster.yml` 재실행에도 남는다 (확인). 관리는 post-configure role `configure-kata-containers` (`config.d/90-workstation.toml`).

**I/O** — 임시 Kata 파드, Longhorn SSD 5Gi, 위 pnpm 벤치 3회 (ms)

| 설정 | offline | rm |
|---|---|---|
| virtiofs, virtiofsd `--thread-pool-size=1` (Kubespray 기본) | 3300~3717 | 5910~6239 |
| virtiofs, 스레드 8 | 4341~4602 | 5524~8802 |
| virtiofs, 스레드 16 | 4603~4776 | 8280~8714 |
| virtiofs, DAX (`virtio_fs_cache_size = 1024`) | 샌드박스 생성 실패 (미지원) | — |
| **Block PVC + 게스트 ext4** | **811~890** | **351~381** |

스레드를 늘리면 오히려 느려진다. Block은 virtiofs 대비 offline 약 4배, rm 약 17배 빠르고 runc·Sysbox PVC보다도 빠르다 → **홈을 Block으로 전환.** Data(HDD)는 큰 파일 위주라 virtiofs 유지.

**메모리** — limit 4Gi 파드, 단계별 호스트 RSS (Q = qemu, V = virtiofsd, MiB)

| 단계 | 2048, 반환 끔 | 2048, 반환 켬 | 1024, 반환 켬 |
|---|---|---|---|
| 대기 | Q 347 | Q 347 | Q 326 |
| 3GiB 할당 | Q 3425 | Q 3425 | Q 3404 |
| 해제 | **Q 3425** | **Q 462** | **Q 392** |
| 2GiB 파일 쓰기·읽기 | Q 3436 / V 2077 | Q 2418 / V 2076 | Q 2398 / V 2079 |
| 파일 삭제 | **Q 3436 / V 2078** | **Q 404 / V 62** | **Q 382 / V 65** |

`reclaim_guest_freed_memory = true`(virtio-balloon free page reporting)면 게스트가 비운 메모리가 즉시 돌아온다. 끄면 안 돌아온다 (앞서 본 대기 워크스페이스 6.7Gi의 원인). virtiofsd 2Gi는 virtiofs로 쓴 파일 데이터이고 삭제 시 반환. 살아 있는 페이지 캐시는 반환 대상이 아니다. `default_memory` 1024는 대기 RSS 차이가 작고(-20MiB) 게스트 MemTotal·캐시 상한을 1Gi 줄인다.

**적용 (2026-10-31)**

- Kubespray `kata_containers_qemu_default_memory: 1024`, 드롭인 `reclaim_guest_freed_memory = true` (`kata_containers_reclaim_guest_freed_memory`)
- RuntimeClass `kata` overhead memory 160Mi → 1Gi (VM이 limit 너머로 쓸 수 있는 최대 = default_memory)
- Kata 템플릿: home PVC `volumeMode: Block` → `/dev/home-disk`, 시작 명령에서 첫 기동 ext4 포맷·매 기동 마운트·`resize2fs`. data는 `/mnt/data`에 받아 home 마운트 위로 bind (home을 컨테이너 안에서 마운트하면 kubelet의 `/home/coder/data` 마운트가 가려지므로). memory request = limit (CPU는 1/4 유지). docker 디스크도 `resize2fs` 추가
- 템플릿 시작 스크립트를 임시 Kata 파드(워크스페이스 이미지, uid 1000)로 검증: 첫 기동 포맷·재기동 데이터 유지·PVC 5Gi→8Gi 확장 후 자동 반영 (4.9G → 7.8G)

### 2026-10-31 대책 적용 후 실제 워크스페이스 재검증

Ubuntu on Kata (Test), CPU 2 / 메모리 4Gi. home·docker PVC Block, request cpu 1 / memory 4Gi, overhead 250m / 1Gi.

| 항목 | 결과 |
|---|---|
| 기동 | 스케줄 → 컨테이너 시작 15초. 재시작 0 |
| 마운트 | `/home/coder` = `/dev/home-disk` ext4, `/home/coder/data` = virtiofs(bind), `/var/lib/docker` = `/dev/docker-disk` ext4 |
| 기타 | 게스트 MemTotal 4.9Gi (default 1Gi + limit), docker 29.7.1, agent·devcontainer CLI·Vault 토큰·`/dev/fuse` 정상 |

홈 I/O (docker 컨테이너에 `/home/coder` 바인드 = devcontainer 워크스페이스 폴더와 같은 경로, ms)

| | offline | rm |
|---|---|---|
| 이전 Kata 워크스페이스 (virtiofs 홈) | 1989 / 2247 | 4718 / 4716 |
| **현재 (Block 홈)** | **593 / 613 / 768** | **420 / 398 / 392** |
| 참고: Sysbox 임시 파드 PVC | 1241 / 2088 | 1342 / 2176 |

→ 홈 I/O는 Sysbox보다 빨라졌다 (offline 약 2배, rm 약 4배).

**메모리 측정 정정.** VM 메모리는 virtiofs 때문에 `/dev/shm` 공유 메모리(`memory-backend-file ... share=on`)로 잡히고 virtiofsd가 같은 페이지를 매핑한다. 따라서 qemu RSS와 virtiofsd RSS를 더하면 **중복 집계**다. 앞의 "대기 워크스페이스 호스트 6.7Gi"(qemu 4672 + virtiofsd 2022)와 실험 표의 V 값도 같은 이유로 과대다. 실제 값은 PSS 합 또는 pod cgroup `memory.stat`의 `shmem`으로 본다.

현재 워크스페이스 (pnpm 벤치 직후, 게스트 used 320Mi / buff·cache 1640Mi):

| 지표 | 값 |
|---|---|
| qemu RSS / PSS | 3272Mi(shmem) / 2642Mi |
| virtiofsd RSS / PSS | 1493Mi(shmem) / 766Mi |
| **PSS 합 ≈ cgroup shmem** | **약 3.3~3.4Gi** — request 4Gi + overhead 1Gi 안 |
| cgroup `inactive_file` | 2773Mi — qemu가 블록 디스크를 호스트 페이지 캐시 경유로 읽고 써서 생긴 이중 캐시. 회수 가능, kubelet working set에서 제외 |
| 메모리 반환 | 2GiB 할당·해제 → qemu 4430Mi → 3420Mi로 반환 확인 (`virtio-balloon-pci ... free-page-reporting=on`) |

남은 후보: Kata `block_device_cache_direct = true`(블록 디스크 O_DIRECT)로 호스트 이중 캐시 제거. 회수 가능한 캐시라 급하지 않음, 미검증.

### 2026-10-31 Kata 워크스페이스 메시 참여 (Mesh Proxy 대체) 검증

배경: Mesh Proxy(SOCKS5)는 워크스페이스에 ambient를 붙이면 안쪽 devContainer 네트워크가 먹통이 돼서 만든 우회로다. Kata에선 Mesh Proxy가 ClusterIP라 쓸 수 없어, 워크스페이스 자체를 메시에 넣을 수 있는지 확인했다. 대상 판정: `coder-sysbox-ubuntu-test`에서 coder 서비스(STRICT + AuthorizationPolicy가 이 네임스페이스만 허용) 200 = mTLS로 메시 통과.

| 구성 | coder 서비스 | vault 서비스 | 외부 | 비고 |
|---|---|---|---|---|
| ambient (`istio.io/dataplane-mode: ambient`) | timeout | timeout | 301 | istio-cni는 `ambient.istio.io/redirection: enabled`를 달지만 트래픽이 우회. Kata `internetworking_model="tcfilter"`가 tap↔eth0를 tc로 바로 넘겨 호스트 쪽 pod netns의 iptables·ztunnel을 안 거친다. coder Pod IP 직접은 평문이라 STRICT에서 reset |
| 사이드카, 기본 주입 | — | — | — | 주입 템플릿이 istio-cni 모드(`istio-validation`, `--run-validation --skip-rule-apply`) → 규칙이 호스트 쪽에 걸려 검증 실패, 파드 시작 안 됨 |
| 사이드카 + `istio-validation` 덮어쓰기 (게스트 안에서 `istio-iptables` 실행, root·NET_ADMIN·NET_RAW) | — | — | — | Envoy가 istiod ClusterIP(`:15012`)에 못 붙어 인증서 발급 실패 → Ready 안 됨. **Cilium ClusterIP 문제가 사이드카에도 선행 조건** |
| 위 + `hostAliases`로 `istiod.istio-system.svc` → istiod Pod IP (테스트 전용 우회) | **200** | **200** | 301 | Envoy가 Pod IP로 직접 보내 ClusterIP 문제도 우회. Pod IP를 직접 부르면 passthrough 평문이라 503 (서비스 이름으로 부르면 됨) |

같은 사이드카 Kata 파드 안에서 dockerd를 띄우고 devContainer 네트워크별로:

| | coder 서비스 | vault 서비스 | 외부 |
|---|---|---|---|
| 파드 자신 (dind 컨테이너) | 200 | 200 | 301 |
| devContainer, Docker 브리지 | DNS 실패 | DNS 실패 | TLS 실패 |
| **devContainer, `--network=host`** | **200** | **200** | **301** |

브리지는 devContainer 트래픽이 파드 입장에서 전달(forward) 트래픽이라 PREROUTING에서 Envoy inbound(15006)로 잘못 잡힌다 (원래 ambient에서 먹통이던 것과 같은 계열로 추정). `--network=host`면 devContainer 프로세스 트래픽이 게스트 자신의 OUTPUT이 되어 사이드카에 정상으로 잡힌다. Kata에서 host = 워크스페이스 VM이라 격리 문제 없음.

**결론: 사이드카 + devContainer `--network=host`면 Mesh Proxy 없이 워크스페이스·devContainer 모두 메시 통신 가능.** 운영 적용 조건:

1. Cilium `socketLB.hostNamespaceOnly=true` — istiod 접속(그리고 일반 ClusterIP)에 필요. `hostAliases` 우회는 istiod 재시작 시 Pod IP가 바뀌어 운영 불가
2. Kata 템플릿: `sidecar.istio.io/inject: "true"`, `istio.io/dataplane-mode: none`, `istio-validation` init 컨테이너 덮어쓰기(게스트 안 iptables), `holdApplicationUntilProxyStarts`
3. devContainer `runArgs: ["--network=host"]` — 레포별 devcontainer.json. 포트가 워크스페이스와 겹치지 않게 주의
4. 미검증: 브리지 유지 시 `traffic.sidecar.istio.io/excludeInterfaces: docker0`로 inbound 오인만 피하는 방법 (메시 서비스는 평문이라 STRICT에서 거부될 것으로 예상)

### 2026-10-31 Cilium `socketLB.hostNamespaceOnly` 적용

사용자 결정으로 적용 (클러스터 미사용 시간대). `ansible/workstation/inventory/group_vars/k8s_cluster/k8s-net-cilium.yml`에 `cilium_extra_values: {socketLB: {hostNamespaceOnly: true}}`.

| 단계 | 내용 |
|---|---|
| 사전 | `cluster.yml --tags network --check --diff`: 차이는 `/etc/kubernetes/cilium-extra-values.yaml`(`{}` → socketLB)뿐, `cilium-values.yaml`·버전(1.20.2) 동일. 기존 파일 노드 `/root/cilium-*-values.yaml.bak-20261031` 백업 |
| 적용 | `pnpm kubespray:cluster --tags network` → `cilium upgrade`. ConfigMap `bpf-lb-sock-hostns-only: "true"` 반영됐지만 **agent는 재시작되지 않아** Coverage `Full` 유지 → `kubectl -n kube-system rollout restart ds/cilium` 필요 |
| 결과 | `Socket LB Coverage: Hostns-only`, 컨트롤러 89/89, 준비 안 된 컨테이너 0 |

검증 (임시 파드, `coder-sysbox-ubuntu-test`):

| 대상 | Kata (메시 밖) | runc (메시 밖) | runc ambient |
|---|---|---|---|
| vault 서비스 ClusterIP | **200** (전엔 timeout) | 200 | 200 |
| coredns ClusterIP TCP | 연결 | 연결 | 연결 |
| istiod `:15012` | 응답 (415) | 응답 | 응답 |
| coder 서비스 (STRICT) | reset (평문, 정상) | reset | **200** |
| coder·vault 외부 도메인 | 200 | 200 | 200 |

→ Kata가 runc와 동일. ambient·ingress 회귀 없음. 사이드카 + `istio-validation` 덮어쓰기 Kata 파드는 **`hostAliases` 우회 없이** istiod에 붙어 coder·vault 200, devContainer `--network=host` 200 / 브리지 실패 (이전 결과와 동일).

수용 기준 1단계(ClusterIP 접근) 해결. 남은 운영 적용: Kata 템플릿 사이드카 구성, devContainer `--network=host`, Mesh Proxy 제거(전환 후).

### 2026-10-31 devContainer 브리지 네트워크 유지 방법 검증

`--network=host` 없이 기본 브리지를 쓰는 방법을 검증 (임시 Kata 파드 + dind, `coder-sysbox-ubuntu-test`).

**B. 메시 밖 + Mesh Proxy (현재 Sysbox 방식).** Cilium 변경 후 Kata에서도 동작: 브리지·사용자 정의 네트워크에서 `--proxy socks5h://coder-workspace-mesh-proxy...:1080`로 coder 200, vault 200.

**A. 사이드카 + 브리지 보정.** 사이드카 파드 그대로는 기본 브리지에서 DNS 실패·TCP가 inbound(15006)로 오인. 원인 두 가지와 보정:

| 증상 | 원인 | 보정 (게스트 netns, Istio와 같은 iptables-nft) |
|---|---|---|
| TCP가 Envoy inbound로 잡힘 | devContainer 트래픽이 파드 입장에선 forward라 PREROUTING `ISTIO_INBOUND`(`-b '*'`)에 걸림 | `iptables -t nat -I PREROUTING 1 -i docker0 -p tcp -j REDIRECT --to-ports 15001` (+ `-i br-+`) → Envoy outbound가 original dst로 처리 |
| 기본 브리지 DNS timeout | Istio raw 규칙 `ISTIO_INBOUND -s 169.254.25.10 -p udp --sport 53 -j CT --zone 1`. 응답은 zone 1, MASQUERADE된 요청 conntrack은 zone 0 → 짝 불일치로 NAT 복원 실패 | `iptables -t raw -I PREROUTING 1 -i docker0 -p udp --dport 53 -j CT --zone 1` (+ `-i br-+`) |

사용자 정의 네트워크(compose)는 Docker 내장 DNS(dockerd가 질의, OUTPUT)라 DNS 보정 없이도 됐다.

보정 후 결과:

| | coder 서비스 (STRICT) | vault 서비스 | 외부 | 기타 |
|---|---|---|---|---|
| 기본 브리지 | **200** | **200** | 301 | `git clone`(https)·HTTP 정상 |
| 사용자 정의 네트워크 | **200** | **200** | 301 | |
| 역방향 (워크스페이스 → devContainer) | — | — | — | 컨테이너 IP 직접·publish 포트(127.0.0.1)·비root 모두 정상 |

**결론: 사이드카 + 브리지 보정 규칙 4줄이면 devcontainer.json 수정 없이 devContainer가 메시 서비스와 자연스럽게 통신.** `--network=host`는 불필요. Kata 템플릿에 넣을 때는 istio init 이후(main 컨테이너 시작 명령, privileged)에 규칙 추가.

### 2026-10-31 Kata 템플릿 전용 네임스페이스 + 사이드카 적용

위 A안을 템플릿에 반영. Mesh Proxy는 Kata 템플릿에서 뺐다.

| 변경 | 위치 |
|---|---|
| 네임스페이스 `coder-kata-ubuntu-test` 신설 (ambient 라벨 없음, Mesh Proxy 없음) | `infra/k8s-workstation-tools/src/components/coder/coder.base.component.ts` |
| Coder Helm `workspaceNamespaces`·coder AuthorizationPolicy `allowedNamespaces`에 추가 | `infra/k8s-workstation-tools/src/contract.ts` |
| 템플릿 변수 `mesh_proxy_*` 제거, `istio_proxy_image`(`containerImages.istioProxyv2`, Istio 버전과 같은 proxyv2) 추가 | `common/utils/src/configs/versions.config.ts`, `coder.resources.component.ts`, `kata-ubuntu/test/variables.tf` |
| 파드 라벨 `sidecar.istio.io/inject: "true"`·`istio.io/dataplane-mode: none`, `holdApplicationUntilProxyStarts` | `kata-ubuntu/test/main.tf` |
| init `istio-validation` 덮어쓰기: proxyv2 이미지로 게스트에서 `istio-iptables` 적용 (root, NET_ADMIN·NET_RAW). Deployment 검증이 주입 전이라 image 필요 | 같은 파일 |
| 시작 명령에 브리지 보정 (`-C`로 확인 후 `-I`, 재시작해도 중복 없음). iptables 백엔드는 Istio 규칙이 있는 쪽을 따른다 | 같은 파일 |

적용 확인: 네임스페이스·Role·RoleBinding 생성, AuthorizationPolicy 소스에 포함, Coder 파드 재시작 없음. 새 네임스페이스에서 server dry-run으로 `istio-proxy` 네이티브 사이드카 주입과 `istio-validation` 덮어쓰기 유지(`--run-validation` 없음) 확인.

**실제 워크스페이스 검증 (사용자 생성, 2026-10-31).** 파드 2/2 (istio-validation 완료 → istio-proxy 네이티브 사이드카 → dev). 홈 블록·data bind·`/dev/fuse` 정상, dockerd 29.7.1(overlayfs). 브리지 보정 4줄이 Istio 규칙 앞에 1회씩(nft 백엔드, ISTIO 26개).

| 출발 | coder (STRICT) | vault | github | DNS |
|---|---|---|---|---|
| 워크스페이스 | 200 | 200 | 200 | — |
| devContainer 기본 bridge | 200 | 200 | 200 | ok |
| devContainer 사용자 정의 네트워크 | 200 | 200 | 200 | ok |

역방향 (워크스페이스 → 컨테이너 IP, publish 포트 127.0.0.1) 모두 200. Mesh Proxy 환경변수 없음.

### 2026-10-31 Kata 템플릿 정리·rclone 마운트·production 템플릿

| 변경 | 내용 |
|---|---|
| Deployment 리소스 | `kubernetes_manifest` → `kubernetes_deployment_v1` (`wait_for_rollout = false`). manifest는 Sysbox의 `hostUsers = false` 때문이었고 Kata는 필요 없음. 업데이트 후 Pod·사이드카·블록 디스크·브리지 보정 재확인 |
| CPU·RAM 메트릭 | `coder stat --host` 제거. `--host`는 Kata VM 전체(기본 1 vCPU·2Gi + 사이드카 limit)를 읽어 5코어·5.89GiB로 보였음. cgroup 기준으로 2코어·4GiB |
| rclone 마운트 | `~/.config/rclone/mounts`(`<이름> <remote:경로> [옵션]`) → `~/mnt/<이름>`. `rclone-mounts` 헬퍼가 30초마다 맞춤 (재마운트·실패 5분 백오프). 자격 증명은 Home의 `rclone.conf` (템플릿 파라미터에 토큰을 두지 않음). `~/mnt`는 rshared |
| production 템플릿 | `kata-ubuntu/main` (test와 동일, Sysbox 방식), 네임스페이스 `coder-kata-ubuntu`(protect), Coder RBAC·AuthorizationPolicy 추가 |

devContainer 전달 실측 (rclone `:memory:`):

| 경우 | Kata | Sysbox |
|---|---|---|
| `--allow-other` 없이 bind | ❌ root 접근 불가 | ❌ |
| `--allow-other` + `user_allow_other` | ✅ 읽기·쓰기 | ❌ runc `change mount propagation through procfd` |
| 상위 `~/mnt`(rshared) → `:rslave`, 나중 마운트·rclone 재시작 | ✅ 자동 반영 | — |
| 개별 마운트 경로 bind 후 rclone 재시작 | ❌ `Socket not connected`, 컨테이너 재시작 전까지 유지 | — |

Sysbox에서 rclone 사본을 unison으로 동기화하던 이유가 위 runc 제약이다. Kata에서는 unison 없이 상위 `~/mnt`를 넘기고 컨테이너 안에서 심볼릭 링크로 쓴다.

## 수용 기준

- [x] GPU·systemd 필요 여부 결정 (둘 다 불필요, 2026-10-24)
- [x] Sysbox 0.7.1 적용 (`sysbox_ce_version`) — 2026-10-31
- [x] Kata 호스트 설치 (Kubespray `kata_containers_enabled` 우선 검토), RuntimeClass `kata`(overhead 포함)를 Pulumi로 추가 — 2026-10-31, Kata 3.32.0
- [ ] FUSE 사용처 확인 (Kata 변형에서 `squat.ai/fuse` 요청 제거 가능 여부)
- PoC는 위험 큰 순서로. 1·2가 막히면 그 시점에 privileged DinD 폴백과 비교
  - [x] 1. 워크스페이스 → ClusterIP Service 접근 (`coder.coder.svc`, Vault) — 트레이드오프 ⑤ (2026-10-31 Cilium `socketLB.hostNamespaceOnly`로 해결)
  - [x] 2. Block docker PVC 위 overlay2로 dockerd 기동, `hello-world`·devcontainer 빌드 성공 — ① (2026-10-31 파드 수준 + 실제 Kata 워크스페이스 devcontainer 빌드 통과)
  - [x] 3. home I/O 실측 (`pnpm install` 등), Sysbox 대비 기록 — ② (2026-10-31, virtiofs 2~4배 느림)
  - [ ] 4. 메모리 사용량·기동 시간 관찰, Sysbox 대비 기록 — ③ ⑥ (2026-10-31: 대책 후 실사용 PSS 약 3.4Gi로 request 안. 1차 6.7Gi는 shmem 중복 집계였음. 기동 15초, Sysbox 워크스페이스 기동 비교는 미측정)
- [ ] (2순위) userns 파드(`hostUsers: false`, 비privileged)에서 `run-dockerd` 스크립트로 dockerd 기동 가능 여부 기록
- [ ] 2027-01-15 판단 결과(이전 / 유지 / 폴백)를 이 문서에 기록

## 범위 밖

- 실제 운영 워크스페이스 이전과 Sysbox 제거 (PoC 결과로 결정 후 별도 이슈)
- K8s 1.36 업그레이드 자체 ([업그레이드 이슈](2026-10-13-kubernetes-1-36-upgrade.md))

## 관련 링크

- https://github.com/nestybox/sysbox/blob/master/docs/user-guide/install-k8s.md
- https://github.com/nestybox/sysbox/releases
- https://github.com/nestybox/sysbox/issues/1031
- https://github.com/adamkaplan/fleet-kit/issues/365
- https://github.com/Wide-Moat/open-computer-use/issues/116

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-24 | 등록. Sysbox 1.36 공식 지원 없음·메인테이너 무응답 확인. 추천: Kata 주력, privileged DinD 폴백, 2026-12까지 PoC |
| 2026-10-24 | GPU 안 씀(사용자), systemd 불필요(템플릿 PID 1 `sh -c`, dockerd는 coder_script 직접 기동) 확정. userns 안을 2순위 PoC로 추가, Kata 주력 유지 |
| 2026-10-24 | Kata 트레이드오프 섹션 추가 (최대 위험 ① `/var/lib/docker` virtio-fs, ⑤ Cilium 소켓 LB 미확인). Kubespray 내장 Kata 롤 확인. 수용 기준을 위험 순 PoC 4단계로 재구성 |
| 2026-10-24 | PoC 착수일 2026-10-31~11-01(주말)로 결정 (사용자). VPA 재스냅샷은 PoC 전 또는 PoC 후 며칠 뒤로 (데이터 오염 방지) |
| 2026-10-31 | PoC 착수. etcd 스냅샷, Sysbox 0.7.1, Kubespray로 Kata 3.32.0 설치, RuntimeClass `kata` Pulumi 적용. PoC 1단계에서 Kata 파드 ClusterIP 전부 timeout(⑤ 확정, Pod IP·외부·DNS는 정상). 해결안 Cilium `socketLB.hostNamespaceOnly=true`는 클러스터 전체 변경이라 사용자 결정 대기 |
| 2026-10-31 | Cilium 변경 보류하고 2단계 먼저 (사용자). Coder·Vault는 외부 도메인 경로라 Kata에서 접근 가능 확인. containerd 핸들러 `kata`(privileged_without_host_devices) 추가, RuntimeClass handler 교체. 임시 파드로 Block PVC 위 overlay2 dockerd·빌드·중첩 네트워크 통과. test 템플릿에 `runtime` 파라미터(kata) 추가·배포. 남은 것: 실제 Kata 워크스페이스 생성·devcontainer 빌드, 3·4단계 |
| 2026-10-31 | 사용자가 test 템플릿으로 Kata 워크스페이스 생성. dockerd(블록 ext4 위 containerd 스냅샷)·devcontainer 빌드 통과 → 2단계 완료. 3단계: virtiofs 홈 I/O가 Sysbox 대비 offline 약 2배·삭제 3~4배 느림. 4단계 1차: 호스트 실사용(qemu+virtiofsd) 6.7Gi vs kubelet 1.2Gi. 임시 파드·devcontainer 정리 |
| 2026-10-31 | Sysbox test 템플릿의 runtime 파라미터 롤백, Kata 전용 템플릿 Ubuntu on Kata (Test) 신규 생성 (네임스페이스 `coder-sysbox-ubuntu-test` 공용). tools 스택 적용 시 브리지 provider(authentik·coderd) 버전 메타 1.5.0 → 1.5.1 함께 반영 (10-29 Node deps 업그레이드분) |
| 2026-10-31 | Kata 템플릿에 `/dev/fuse` mknod·`/etc/mtab` 링크 추가 (FUSE 상시 제공, 개수 파라미터 없음). Kata 전면 전환 시 generic-device-plugin·lxcfs 제거 가능 확인 (사용처가 Sysbox 템플릿뿐, 라이브 사용 파드 0) |
| 2026-10-31 | I/O·메모리 대책 실험 (사용자: 클러스터 미사용 중). virtiofsd 스레드 증가는 역효과, DAX 미지원, Block 홈이 virtiofs 대비 4~17배 빠름. 메모리 반환 켜면 해제분 즉시 반환. 적용: default_memory 1024, `reclaim_guest_freed_memory`(Ansible role `configure-kata-containers`), overhead 1Gi, Kata 템플릿 홈 Block·request=limit |
| 2026-10-31 | 대책 적용 후 새 Kata 워크스페이스 재검증. 홈 I/O offline 593~768ms·rm 392~420ms (Sysbox PVC보다 빠름). 메모리: qemu+virtiofsd RSS 합은 `/dev/shm` 공유 메모리 중복 집계였음을 확인 (앞의 6.7Gi 과대), 실사용 PSS 약 3.4Gi로 request 4Gi 안. 블록 디스크 호스트 이중 캐시(회수 가능) 확인 |
| 2026-10-31 | Kata 워크스페이스 메시 참여 검증. ambient 불가 (tcfilter가 pod netns iptables 우회). 사이드카는 istio-cni 모드 주입을 게스트 내 iptables로 덮어쓰고, istiod ClusterIP를 우회하면 STRICT 서비스 200. devContainer는 브리지 실패, `--network=host` 성공. 운영 적용은 Cilium ClusterIP 해결이 선행 |
| 2026-10-31 | Cilium `socketLB.hostNamespaceOnly=true` 적용 (`cilium_extra_values`, kubespray `--tags network` + cilium DS 재시작). Coverage Hostns-only. Kata ClusterIP가 runc와 동일해짐, ambient·ingress 회귀 없음. 사이드카 Kata 파드가 우회 없이 istiod 접속·STRICT 서비스 200 |
| 2026-10-31 | devContainer 브리지 유지 검증. Mesh Proxy 경유는 Kata에서도 동작. 사이드카 + 보정(브리지 TCP → Envoy 15001, 브리지 DNS 요청 conntrack zone 1)으로 기본 브리지·compose 네트워크 모두 STRICT 서비스 200, `--network=host` 불필요. DNS 실패 원인은 Istio raw 규칙의 DNS 응답 zone 1 분류 |
| 2026-10-31 | A안 적용: Kata 템플릿 전용 네임스페이스 `coder-kata-ubuntu-test` (Coder RBAC·AuthorizationPolicy 포함), Mesh Proxy 제거, Istio 사이드카(`istio-validation` 덮어쓰기)와 devContainer 브리지 보정을 템플릿에 반영. tools 스택 적용, 주입 dry-run 확인. 기존 Kata 워크스페이스는 사용자가 삭제 |
| 2026-10-31 | 새 Kata 워크스페이스(`coder-kata-ubuntu-test`)로 A안 검증: 사이드카 기동, 워크스페이스·devContainer(기본 bridge·사용자 정의 네트워크)에서 coder(STRICT)·vault·외부 200, DNS·역방향 정상. PoC 전 etcd 스냅샷은 로컬 `tmp/`(gitignore)로 옮기고 노드 사본 삭제 (sha256 일치 확인) |
| 2026-10-31 | Kata 템플릿 File Browser 제거: 설치 스크립트의 `setcap`이 virtiofs 루트(virtiofsd `--xattr` 없음)에서 `Operation not supported`. `--xattr` 드롭인은 보류 (필요 도구 생기면 검토). Docker Disk 메트릭은 블록 디스크 마운트 전 "준비 중" 폴백 |
| 2026-10-31 | Kata 템플릿: Deployment를 `kubernetes_deployment_v1`로 전환, CPU·RAM 메트릭 `--host` 제거 (VM 전체 대신 cgroup 기준). 실제 워크스페이스 업데이트로 확인 |
| 2026-10-31 | Kata 템플릿 rclone 마운트 추가 (`~/.config/rclone/mounts` → `~/mnt/<이름>`). Google Drive 마운트 실사용 확인. devContainer는 상위 `~/mnt` rslave로 전달 (개별 경로는 rclone 재시작 시 끊김), Sysbox는 runc 제약으로 불가 |
| 2026-10-31 | Kata production 템플릿 `kata-ubuntu-template`·네임스페이스 `coder-kata-ubuntu` 추가 (tools 스택 적용, Coder RBAC·AuthorizationPolicy 반영). 클러스터 점검: 노드 Ready, 비정상 Pod·미바인딩 PVC·비정상 Longhorn 볼륨 없음, drift 없음 |
