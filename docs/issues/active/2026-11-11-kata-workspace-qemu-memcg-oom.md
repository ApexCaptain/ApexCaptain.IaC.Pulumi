# Kata 워크스페이스 접속 끊김 — 파드 memcg OOM으로 QEMU kill

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-11-11 |
| **영역** | workstation-0 · Kata(QEMU) · Coder `kata-ubuntu` 워크스페이스 |
| **관련 코드** | `infra/k8s-workstation-system/src/components/kata/kata.component.ts`, `ansible/workstation/roles/configure-kata-containers/`, `ansible/workstation/inventory/group_vars/k8s_cluster/k8s-cluster.yml` |
| **상태** | **적용** — 배포·검증 완료. 2026-11-18 재점검 |
| **재점검일** | 2026-11-18 — 노드 kern.log qemu OOM 재발 여부, 워크스페이스 파드 memcg `memory.peak`·`memory.events` 확인 → 이상 없으면 resolved 이동 |

## 배경

Coder 런타임은 Kata (Sysbox 2026-11-06 제거, [sysbox 교체](../resolved/2026-10-24-sysbox-runtime-replacement.md)). 2026-10-31 설정: `default_memory` 1024, RuntimeClass overhead 1Gi, `reclaim_guest_freed_memory`, 홈 Block PVC.

## 증상

워크스페이스(Primary-Kata) 접속이 갑자기 끊기고 몇 분 뒤 새 파드로 복구. 사용자 체감 "리소스를 너무 크게 잡아서?"

## 실측

`kubectl get --raw /api/v1/nodes/workstation-0/proxy/logs/kern.log` (MCP `nodes_log`는 디렉터리 목록만 반환)

| 일시 (KST) | 내용 |
|------|------|
| 2026-11-10 14:49:01 | `Memory cgroup out of memory: Killed process (qemu-system-x86) shmem-rss:13716544kB` |
| 2026-11-11 13:31:36 | 같은 패턴. memcg `usage 18874360kB, limit 18874368kB`, `shmem 18891194368`, qemu `shmem-rss:18446228kB`. 트리거는 `iou-wrk-<qemu>` → `blkdev_write_iter` (호스트 버퍼드 쓰기) |
| 2026-11-11 13:31:42 | 이벤트 `Pod sandbox changed, it will be killed and re-created` |
| 2026-11-11 13:35:38 | 재생성 sandbox 종료 (OOM 로그 없음 — 워크스페이스 재시작) → 13:35:42 새 파드 |

당시 파드: dev limit 16Gi + istio-proxy 1Gi + overhead 1Gi = memcg 18Gi. 게스트 RAM = default_memory 1Gi + limit 17Gi = 18Gi.

## 원인

1. 게스트 RAM은 호스트에서 shmem(memfd)으로 파드 memcg에 잡힌다. 게스트 페이지 캐시가 차면 VM 하나가 memcg를 100% 채운다 (`reclaim_guest_freed_memory`는 free 페이지만 반환, 살아 있는 캐시는 대상 아님).
2. overhead(1Gi) = default_memory(1Gi)라 호스트 측(QEMU 자체·virtiofsd·I/O) 여유가 0.
3. `block_device_cache_direct` 기본 false → QEMU가 Block PVC에 버퍼드 쓰기 → 호스트 페이지 캐시가 같은 memcg에 추가 charge (게스트·호스트 이중 캐시). 큰 쓰기 때 한도 초과 → OOM killer가 qemu 선택.

limit 크기와 무관 (11-10은 VM 14GB에서 발생). limit을 키우면 VM도 같이 커진다.

| 가설 | 판정 |
|------|------|
| 리소스를 크게 잡아서 노드 메모리 부족 | 배제 — `CONSTRAINT_MEMCG`, 파드 memcg 한도 도달 |
| 게스트 내부 OOM | 배제 — 호스트 커널이 qemu kill |

## 조치

| 안 | 내용 | 판단 |
|------|------|------|
| A | Kata 드롭인 `block_device_cache_set`·`block_device_cache_direct = true` (O_DIRECT, 호스트 페이지 캐시 우회) | **적용** — 원인 제거. `cache_set`이 true여야 `cache_direct`가 반영됨 |
| B | RuntimeClass overhead memory 1Gi → 2Gi | **적용** — 호스트 측 여유 1Gi |

- A: `ansible/workstation/roles/configure-kata-containers/templates/90-workstation.toml.j2`, 운영 값 `kata_containers_block_device_cache_direct: true` (`k8s-cluster.yml`). 샌드박스 생성 시 읽으므로 새 Kata 파드부터 반영.
- B: `kata.component.ts` `overhead.podFixed.memory: '2Gi'`. overhead는 파드 생성(admission) 때 붙으므로 기존 파드는 재생성 필요. 워크스페이스 요청량 +1Gi.

## 반영 순서

1. Ansible `post-configure.yml --tags configure-kata-containers` (드롭인)
2. Pulumi `k8s-workstation-system` up (RuntimeClass overhead)
3. 워크스페이스 stop/start (새 sandbox·overhead 반영)

## 수용 기준

- [x] 노드 `/etc/kata-containers/config.d/90-workstation.toml`에 `block_device_cache_set`·`block_device_cache_direct = true`
- [x] RuntimeClass `kata` overhead memory 2Gi, 새 워크스페이스 파드 `spec.overhead.memory: 2Gi`
- [x] 새 qemu block 디바이스 fd에 O_DIRECT (QMP 핫플러그라 cmdline엔 없음. `/proc/<qemu>/fdinfo` flags `040000`)
- [x] 워크스페이스에서 대용량 쓰기(예: 20GiB `dd` 또는 docker build) 후 qemu OOM 없음, 파드 memcg 사용량 < limit
- [x] 홈 Block 쓰기 성능 실측 — 기존(10-31) 대비 큰 저하 없음

## 검증 (2026-11-11)

| 항목 | 결과 |
|------|------|
| 20GiB `dd ... conv=fsync` (홈 Block) | 261s, 82 MB/s. OOM 없음 |
| 파드 memcg | max 19456Mi, **peak 18720Mi** (여유 약 736Mi), `memory.events` max·oom·oom_kill 0. 파일 삭제 후 current 5813Mi (반환 동작) |
| 해석 | 게스트 RAM 상한 18Gi(18432Mi) + 호스트 측 약 290Mi. 호스트 페이지 캐시가 memcg에 더 이상 쌓이지 않음 |
| `pnpm install --offline` / `rm` (파일 21,136개, node:22 컨테이너에 `/home/coder` 바인드, ms) | **477 / 587 / 516** · **153 / 200 / 157** (10-31 Block 홈: 593 / 613 / 768 · 420 / 398 / 392). 저하 없음. pnpm 12.18이라 10-31과 버전 차이 있음 |

## 범위 밖

- 게스트 페이지 캐시 상한 조절(guest `vm.*` 튜닝)·virtio-mem — 재발 시 후속 이슈
- PriorityClass·eviction — [PriorityClass·eviction](2026-09-13-priority-class-resource-protection.md)

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-11-11 | 등록. 11-10 14:49·11-11 13:31 qemu memcg OOM 확인, 원인 분석. A(O_DIRECT)·B(overhead 2Gi) 코드 반영 |
| 2026-11-11 | 워크스페이스 Stop. Ansible `--tags configure-kata-containers` 적용 (check→apply), 노드 드롭인 `block_device_cache_set`·`block_device_cache_direct = true` 확인 |
| 2026-11-11 | Pulumi `k8s-workstation-system` up: RuntimeClass `kata` overhead memory 1Gi → 2Gi 적용 (1 updated) |
| 2026-11-11 | 워크스페이스 Start. 새 파드 `spec.overhead.memory` 2Gi, limits memory 19Gi. qemu block fd `/dev/sds`·`/dev/sdt` flags `02140002` → O_DIRECT 확인 |
| 2026-11-11 | 부하 검증: 20GiB dd OOM 없음, memcg peak 18720Mi / max 19456Mi, oom_kill 0. pnpm offline·rm 벤치 저하 없음. 테스트 파일·이미지 정리. 상태 → 적용 |
| 2026-11-11 | 재점검일 2026-11-18 지정 (사용자) |
