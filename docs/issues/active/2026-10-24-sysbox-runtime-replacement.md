# Sysbox 대체 런타임 선정

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-24 |
| **영역** | Coder 워크스페이스 런타임 (`sysbox-runc` RuntimeClass), `workstation-0` 호스트 |
| **관련 코드** | `ansible/workstation/roles/install-sysbox-runc/`, `ansible/workstation/inventory/group_vars/all/all.yml` (`sysbox_ce_version`), `infra/k8s-workstation-system/src/components/sysbox/`, `infra/k8s-workstation-tools/src/components/coder/`, `infra/k8s-workstation-tools/assets/coder/sysbox-ubuntu/` |
| **상태** | **조사중** — 추천안 Kata Containers. PoC 전 |

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

## 수용 기준

- [x] GPU·systemd 필요 여부 결정 (둘 다 불필요, 2026-10-24)
- [ ] Sysbox 0.7.1 적용 (`sysbox_ce_version`)
- [ ] Kata 호스트 설치 (Kubespray `kata_containers_enabled` 우선 검토), RuntimeClass `kata`(overhead 포함)를 Pulumi로 추가
- [ ] FUSE 사용처 확인 (Kata 변형에서 `squat.ai/fuse` 요청 제거 가능 여부)
- PoC는 위험 큰 순서로. 1·2가 막히면 그 시점에 privileged DinD 폴백과 비교
  - [ ] 1. 워크스페이스 → ClusterIP Service 접근 (`coder.coder.svc`, Vault) — 트레이드오프 ⑤
  - [ ] 2. Block docker PVC 위 overlay2로 dockerd 기동, `hello-world`·devcontainer 빌드 성공 — ①
  - [ ] 3. home I/O 실측 (`pnpm install` 등), Sysbox 대비 기록 — ②
  - [ ] 4. 메모리 사용량·기동 시간 관찰, Sysbox 대비 기록 — ③ ⑥
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
