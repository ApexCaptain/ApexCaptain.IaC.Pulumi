# Kubernetes 1.35.4 → 1.36 점진 업그레이드

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-13 |
| **영역** | `workstation-0` 단일 노드 (control-plane 겸 worker), Kubespray 기반 클러스터 |
| **관련 코드** | `ansible/workstation/inventory/group_vars/k8s_cluster/k8s-cluster.yml` (`kube_version`), `ansible/third_party/kubespray` (submodule, `release-2.32` 브랜치), `package.json` (`kubespray:upgradeCluster`) |
| **예정일** | Phase 1: **2026-10-30 (금)**. Phase 2: Sysbox가 K8s 1.36을 지원 문서에 넣기 전 착수 금지. **결정일 2027-01-15** — 그날까지 미지원이면 Sysbox를 버리고 다른 런타임으로 이전 |
| **상태** | **보류** — 1.36은 [nestybox/sysbox](https://github.com/nestybox/sysbox) 미지원으로 제동. K8s 1.35 EOL은 2027-02-28 |

## 배경

`kubectl version` 기준 서버 v1.35.4, 클라이언트 v1.37.1이다. 클라이언트가 서버보다 2 minor 앞서 skew 경고가 난다. 최종 목표는 서버를 1.36.x로 올리는 것이다.
클라이언트 1.37은 서버를 1.36으로 올리면 +1 minor가 되어 skew 경고가 사라진다.

Nova 진단(`docs/diagnosis/nova.diagnosis.md`)에서 apiserver·controller-manager·scheduler 이미지의 최신 패치가 v1.35.9로 나온다. Pluto 진단(`docs/diagnosis/pluto.diagnosis.md`)은 target v1.36.0 기준 deprecated·removed API 없음으로 나왔다 (2026-10-13 03:51Z).

## 현재 상태 (2026-10-15 갱신)

| 항목 | 값 |
|---|---|
| 노드 | `workstation-0` 1대, Ready, v1.35.4, Ubuntu 26.04, kernel 7.0.0-38, containerd 2.3.5 |
| 설치 도구 | Kubespray (`kube_version: 1.35.4` 고정). submodule은 v2.31.0 + 178 커밋 (2026-09-26) |
| Kubespray가 아는 버전 | kubelet/kubeadm 체크섬에 1.35.4~1.35.9, 1.36.0~1.36.5 존재. **1.36.5가 상한** |
| CNI | Cilium 1.20.2, `cilium_kube_proxy_replacement: true` (kube-proxy Pod 없음) |
| 컨트롤 플레인 | kube-apiserver / controller-manager / scheduler static Pod, kube-vip(ARP) VIP |
| 컨트롤 플레인 재시작 | apiserver 14회, controller-manager 116회, scheduler 124회 (리더 선출 노이즈로 추정, 미확인) |
| Sysbox | 호스트 설치(Ansible), RuntimeClass `sysbox-runc`만 Pulumi. `sysbox-deploy-k8s` DaemonSet 미사용. upstream 지원 상한은 K8s 1.35 |
| Longhorn | 1.13.0 차트, 운영 PVC 18개 `replicas=1`, 엔진 `v1.13.0` 일괄 완료 ([해결 기록](../resolved/2026-10-07-longhorn-1-13-0-upgrade.md)). Jellyfin 백업용 clone VolumeSnapshot PVC는 [pCloud 백업](2026-09-15-pcloud-pvc-encrypted-backup.md) 이슈 |
| Istio | ambient 1.30.x, 2026-10-12에 재부팅 후 리다이렉트 유실 이슈 해결 ([해결 기록](../resolved/2026-10-12-ambient-reboot-redirect.md)) |

## 문제와 위험

단일 노드라 업그레이드 동안 API 서버와 워크로드 중단이 불가피하다. 노드를 나눠 롤링할 수 없다.

| 위험 | 내용 | 대응 방향 |
|---|---|---|
| drain 중단 | Kubespray `upgrade-cluster`는 기본 `drain_nodes: true`. 단일 노드 drain은 전 워크로드 evict. PDB·Longhorn attach 때문에 timeout(360s) 가능 | 아래 "drain 정책" |
| replica 1 볼륨 | Longhorn 운영 볼륨 전부 replica 1. kubelet·containerd 재시작 시 attach 끊김 가능 | 하드 백업 선행, 쓰기 큰 워크로드 scale 0 검토 |
| 재부팅·CNI | 재시작 후 Cilium → istio-cni 체인과 ambient 리다이렉트 복구 확인 필요 | 2026-10-12 이슈의 검증 절차 재사용 |
| Sysbox | 공식 지원은 v1.32~v1.35. v1.36은 지원 목록 밖이라 Phase 2 착수 금지. 호스트 설치라 DaemonSet 버전 게이트는 안 타도 upstream이 1.36을 넣기 전에는 올리지 않음 | 2027-01-15에 재확인. 미지원이면 런타임 교체. 지원이 생기면 Coder Sysbox 워크스페이스 기동을 Phase 2 검증에 포함 |
| 애드온 호환 | Cilium 1.20.2, Longhorn 1.13.0, Istio 1.30.x, metrics-server 0.9.0, VSO 등의 K8s 1.36 지원 여부 | Phase 0에서 각 릴리스 노트 확인 |
| Kubespray 버전 | submodule이 `release-2.32` 추적. 1.36 체크섬은 있으나 업그레이드 경로 실검증 없음 | 실행 직전 submodule 상태·`kube_version_min_required` 재확인 |

## 접근 비교

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| A | 1.35.4 → 1.36.5 한 번에 | 중단 1회 | 패치 건너뛰기 + minor 동시 변경, 문제 원인 분리 어려움 |
| **B (추천)** | 1.35.4 → 1.35.9 → 1.36.5 두 단계 | 첫 단계로 절차·drain·복구를 저위험(패치)에서 리허설. 실패 원인 분리 쉬움 | 중단 2회 |
| C | 1.36.0으로 먼저 올린 뒤 패치 | 없음 | 1.36.0은 초기 릴리스. 이점 없음 |

Kubespray 문서상 minor는 한 단계씩만 올린다. 1.35 → 1.36은 한 단계이므로 B가 이를 만족한다. 1.37은 이번 범위에 넣지 않는다. B의 두 번째 단계(Phase 2)는 아래 Sysbox 제동이 풀리기 전에는 실행하지 않는다.

## Sysbox로 인한 1.36 제동

[Sysbox Kubernetes 설치 문서](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/install-k8s.md) (2026-10-13 확인)의 지원 범위는 다음뿐이다.

- Kubernetes v1.32.*
- Kubernetes v1.33.*
- Kubernetes v1.34.*
- Kubernetes v1.35.*

그 외 버전은 지원하지 않는다고 적혀 있다. v1.36 지원 요청 [nestybox/sysbox#1036](https://github.com/nestybox/sysbox/issues/1036)은 2026-08-24에 열렸고 아직 open이다.

이 클러스터의 Coder 워크스페이스는 Sysbox(`sysbox-runc`)에 의존한다. 그래서 API를 1.36으로 올리는 Phase 2는 upstream이 1.36을 지원 목록에 넣기 전에는 하지 않는다. Phase 1(1.35.4 → 1.35.9)은 같은 minor이고 Sysbox 지원 안이라 2026-10-30 일정을 유지한다.

Kubernetes 1.35 일정 ([릴리스 페이지](https://kubernetes.io/releases/1.35/)):

| 구분 | 날짜 |
|---|---|
| maintenance mode 시작 | 2026-12-28 |
| End of Life | 2027-02-28 |

**결정:** 2027-01-15까지 Sysbox 지원 문서에 Kubernetes 1.36이 없으면, Sysbox를 버리고 다른 컨테이너 런타임으로 이전한 뒤 1.36 업그레이드를 재개한다. 1.35 EOL(2027-02-28)보다 앞당긴 날짜다. maintenance mode(2026-12-28) 이후에도 패치는 나오지만, EOL 직전에 런타임을 바꾸면 여유가 없다.

런타임 선정과 이전 작업은 그 트리거가 켜질 때 후속 이슈로 분리한다. 그 전에 후보를 이 문서에서 고르지 않는다.

확인 방법: `install-k8s.md`의 Kubernetes Version Requirements에 v1.36이 들어가는지, [#1036](https://github.com/nestybox/sysbox/issues/1036)이 지원 추가로 닫히는지.

## 계획

각 Phase 사이에 안정화 기간을 둔다. 날짜는 사용자와 합의 후 확정한다.

### Phase 0 — 사전 점검 (클러스터 변경 없음)

- [x] 하드 백업 최신 여부 확인. Longhorn 이슈와 마찬가지로 replica 1 + Longhorn 백업 없음 상태이므로 사용자가 직접 수행 — 2026-10-20 사용자가 주요 데이터 백업 완료
- [x] etcd 스냅샷 수동 생성 — 2026-10-20 17:56 KST. 아래 "etcd 스냅샷"
- [x] 스냅샷을 호스트 밖으로 복사 (다른 PC·pCloud 등, 사용자 수행) — 2026-10-20 사용자 완료. devcontainer가 `workstation-0` 위에서 돌아서 `./tmp`는 같은 디스크다
- [ ] Phase 1 당일 착수 직전에 스냅샷을 다시 뜬다 (10-20 스냅샷은 그때 10일 지난 상태)
- [x] 호환성 확인 (릴리스 노트 대조, 결과를 이 문서에 표로 추가) — 아래 "호환성 표"
- [x] 1.36 deprecation·removal 항목 대조 (feature gate, kubelet 플래그, `kubeadm` 설정 API). Pluto 통과는 API 버전만 본다 — 아래 "1.36 deprecation·removal 대조"
- [x] kube-vip·containerd·cgroup(v2)·swap 설정이 Kubespray 1.36 기본값과 충돌하는지 확인 (`kubelet_fail_cgroup_v1`, `kubelet_fail_swap_on`) — 아래 "노드·Kubespray 설정 대조"
- [x] 현재 이미지·버전 기록 (`kubectl get pods -A -o wide`, 노드 describe) — 스냅샷과 같은 디렉터리. 기록 시점에 Running·Completed가 아닌 Pod 없음
- [x] 시간대 선택: 사용 적은 시간. 사용자 1인 클러스터라 사전 공지 불필요 (2026-10-20 결정) — 해당 없음. 당일 사용자가 편한 시간에 진행
- [x] drain 정책 결정 (아래) — 2026-10-20 확정
- [x] 실행 위치 결정 — 2026-10-20 메인 PC로 확정 (아래 "실행 위치")
- [ ] 메인 PC 실행 환경 준비 (아래 "실행 위치"의 준비 항목)

### etcd 스냅샷

| 항목 | 값 |
|---|---|
| 위치 | `tmp/etcd-snapshot/pre-1.35.9-20261020-175649/` (gitignore. Secret이 평문으로 들어 있으니 커밋·공유 금지) |
| 파일 | `etcd.db`, `SNAPSHOT.txt`(sha256·리비전), `cluster-state.txt`, `images.txt`, `node-describe.txt` |
| 검증 | 노드의 `etcdutl snapshot status`: revision 82072356, keys 2804, 170 MB. 노드 원본과 sha256 일치 |
| etcd | 3.6.15, Kubespray `etcd_deployment_type: host` (systemd `etcd.service`, 설정은 `/etc/etcd.env`) |

생성 방법 (노드에서, sudo 비밀번호 불필요):

```bash
sudo /usr/local/bin/etcdctl.sh snapshot save /tmp/etcd-<ts>.db   # Kubespray 래퍼, 인증서 경로 포함
/usr/local/bin/etcdutl snapshot status /tmp/etcd-<ts>.db -w table
```

devcontainer에서 SSH할 때는 인벤토리처럼 `WORKSTATION_BOOTSTRAP_NODE_0_EXTERNAL_SSH_PORT`를 쓴다 (22번은 열려 있지 않다).

복원 절차(단일 노드, 큰 줄기만): `etcd.service`와 kubelet 중지 → 기존 data dir(`/etc/etcd.env`의 `ETCD_DATA_DIR`) 이동 → `etcdutl snapshot restore etcd.db --data-dir <ETCD_DATA_DIR> --name <etcd_member_name> --initial-cluster <name>=https://<ip>:2380 --initial-advertise-peer-urls https://<ip>:2380` → 소유권 맞춤 → etcd, kubelet 기동. 실제 복원은 아직 리허설하지 않았다. Phase 2 전에 한 번 문서로 다시 확인한다 (위 "롤백").

### 호환성 표 (2026-10-20 확인)

버전은 클러스터에서 실제 실행 중인 이미지 기준이다 (차트 버전은 `common/utils/src/configs/versions.config.ts`). Phase 1(1.35.9)은 모든 항목의 지원 범위 안이다. 아래 판정은 Phase 2(1.36) 기준이다.

| 컴포넌트 | 실행 버전 | 1.36 | 근거 |
|---|---|---|---|
| Cilium | v1.20.2 (Kubespray) | ✅ | [v1.20 compatibility](https://docs.cilium.io/en/v1.20/network/kubernetes/compatibility/): 1.33–1.36 e2e 테스트 |
| Longhorn | v1.13.0 | ✅ | [1.13.0 best practices](https://longhorn.io/docs/1.13.0/best-practices/): 1.33–1.36 테스트. 최소 버전은 1.34 (CSI provisioner v6.3.0) |
| Istio | 1.30.6 | ✅ | [supported releases](https://istio.io/latest/docs/releases/supported-releases/): 1.32–1.36 지원. 1.30 EOL은 2026-12 예상 |
| metrics-server | v0.9.0 (Kubespray) | ✅ | [README 호환표](https://github.com/kubernetes-sigs/metrics-server): 0.9.x는 1.34 이상 |
| Vault Secrets Operator | 1.6.0 | ✅ | [CHANGELOG 1.6.0](https://github.com/hashicorp/vault-secrets-operator/blob/main/CHANGELOG.md): 1.33–1.37 테스트 |
| NVIDIA GPU Operator | v26.7.2 | ✅ | [platform support](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/platform-support.html): Ubuntu 26.04 베어메탈에서 1.33–1.37 |
| Argo Rollouts | v1.10.1 | ⚠️ | v1.10.1 태그의 e2e 매트릭스(`.github/workflows/testing.yaml`)는 1.32–1.35. main은 1.34–1.37을 테스트한다. Phase 2 전에 1.36을 테스트한 릴리스가 나왔는지 다시 보고 있으면 먼저 올린다 |
| VPA | recommender 1.7.1 | ✅ | [installation.md](https://github.com/kubernetes/autoscaler/blob/master/vertical-pod-autoscaler/docs/installation.md): 1.7.x는 1.35–1.37 |
| cert-manager | v1.21.2 | ✅ | [supported releases](https://cert-manager.io/docs/releases/): 1.33–1.36 지원·테스트 |
| CloudNativePG | 1.30.1 | ✅ | [supported releases](https://cloudnative-pg.io/docs/devel/supported_releases): 1.30.x는 1.34–1.36 |
| Coder | v2.38.0 | ✅ | [K8s 설치 문서](https://coder.com/docs/install/kubernetes): 1.19 이상, 상한 없음. 실제 제약은 Sysbox |
| Sysbox | 호스트 설치 | ❌ | 1.32–1.35만 지원 (위 "Sysbox로 인한 1.36 제동") |
| kube-vip | v1.0.3 (Kubespray static Pod) | ⚠️ | 공식 K8s 호환표 없음. Kubespray `release-2.32`가 1.36.5까지 이 버전을 기본값으로 쓴다. Phase 2 직후 VIP 응답을 확인한다 |
| CoreDNS | Kubespray 관리 | ✅ | Kubespray `coredns_supported_versions`가 1.36에서 1.14.2로 자동 전환 |
| 기타 (Reloader v1.4.22, redis-operator v0.27.0, OTel operator 0.161.0, snapshot-controller v8.7.0, Authentik, 모니터링 차트 등) | — | ➖ | 공식 호환표는 확인하지 않았다. Pluto는 1.36 기준 deprecated·removed API 없음. 공통 검증 체크리스트로 확인한다 |

결론: Phase 1에는 막는 항목이 없다. Phase 2를 막는 것은 기존대로 Sysbox뿐이다. Argo Rollouts와 kube-vip은 막지는 않지만 Phase 2 전후에 다시 확인한다.

### 1.36 deprecation·removal 대조 (2026-10-20 확인)

근거는 [CHANGELOG-1.36.md](https://github.com/kubernetes/kubernetes/blob/master/CHANGELOG/CHANGELOG-1.36.md)의 "Changelog since v1.35.0"이다. Phase 2에만 해당한다. Sysbox 때문에 Phase 2가 2027-01 이후로 밀리면 그때 1.36.x 패치 노트를 다시 본다.

| 변경 | 이 클러스터 | 판정 |
|---|---|---|
| Service `.spec.externalIPs` deprecated (경고만, 제거 아님) | `istio-system/istio-ingressgateway`가 사용 (`infra/k8s-workstation-system/src/components/istio/istio.helm-chart.component.ts`의 `externalIPs: [args.workstationIpV4Address]`) | ⚠️ 1.36에서는 경고만 나온다. 제거 시점이 정해지면 LoadBalancer IP(Cilium L2, `loadBalancerIPs: true`)만으로 충분한지 검토하는 후속 이슈로 분리 |
| `gitRepo` volume 플러그인 기본 비활성 | 사용 Pod 0개 | ✅ |
| kubeadm flex-volume 지원 제거, in-tree Portworx 제거 | flexVolume PV 0개, Longhorn CSI 사용 | ✅ |
| 제거된 feature gate (`WatchFromStorageWithoutResourceVersion`, `HonorPVReclaimPolicy`, kubeadm `ControlPlaneKubeletLocalMode` 등) | kubelet `featureGates` 없음, apiserver `--feature-gates` 없음, 인벤토리에 feature gate 오버라이드 없음 | ✅ |
| kubelet deprecated 설정 플래그 제거 | 1.37로 연기됨 | ✅ (1.37 이슈에서 다시 확인) |
| kubeadm: etcd < 3.6 미지원 | Kubespray가 1.35·1.36 모두 etcd 3.6.x (`etcd_supported_versions`, host 배포) | ✅ |
| kubeadm 설정 API | Kubespray 템플릿이 이미 `kubeadm.k8s.io/v1beta4` | ✅ |
| `StrictIPCIDRValidation` 기본 활성 (IP·CIDR 앞자리 0 거부) | 인벤토리 CIDR·IP는 env 주입, 앞자리 0 표기 없음 | ✅ |
| 메트릭 이름 변경·제거 (`volume_operation_total_errors` → `volume_operation_errors_total`, cadvisor `container_cpu_load_average_10s` 등) | `infra`·`common`에서 해당 메트릭 참조 없음 | ✅ |
| `scheduling.k8s.io/v1alpha1` Workload, `SnapshotMetadataService` v1alpha1, `WebhookAdmissionConfiguration` v1alpha1 제거 | 사용 안 함 (Pluto 1.36 통과) | ✅ |

### 노드·Kubespray 설정 대조 (2026-10-20 확인)

| 항목 | 실측 | Kubespray 기본값 | 판정 |
|---|---|---|---|
| cgroup | `/sys/fs/cgroup`이 `cgroup2fs`, kubelet `cgroupDriver: systemd` | `kubelet_fail_cgroup_v1: true` | ✅ v2라 충돌 없음 |
| swap | kubelet `failSwapOn: true`로 정상 기동 중 (swap 꺼짐) | `kubelet_fail_swap_on: true` | ✅ |
| containerd | 2.3.5 | `release-2.32` 체크섬 최신값 2.3.5 | ✅ 업그레이드 중 교체 없음 |
| kube-vip | v1.0.3 static Pod | `kube_vip_version: 1.0.3` | ✅ 버전 변화 없음 |
| sysbox·nvidia 런타임 | `containerd_additional_runtimes`로 등록 (`SystemdCgroup: 'true'`) | — | ✅ Kubespray가 containerd 설정을 다시 써도 인벤토리 값으로 유지 |

### drain 정책 (2026-10-20 확정)

| 선택지 | 내용 | 비고 |
|---|---|---|
| 기본 drain | `drain_nodes: true`, timeout 360s | Longhorn·PDB에 걸려 실패 가능. 실패 시 `upgrade_node_fail_if_drain_fails: true`라 중단 |
| drain 생략 | `-e drain_nodes=false` | 단일 노드에서 evict는 어차피 같은 노드에 재스케줄. 재시작 시 기존 Pod는 kubelet 재기동 후 유지됨. 재부팅 이슈와 동일하게 drain 없는 경로로 이미 검증된 적 있음 |
| 수동 선행 | 큰 쓰기 워크로드(qBit, Coder 등)를 먼저 scale 0 | 볼륨 detach로 replica 1 위험 감소 |

**추천:** Phase 1에서 drain 생략 + 쓰기 큰 워크로드 scale 0으로 시작해 영향 관찰. 확정은 Phase 0 마지막에.

**결정 (2026-10-20):** drain 생략(`-e drain_nodes=false`) + 아래 선행 정지.

| 대상 | 방법 | 이유 |
|---|---|---|
| Coder 워크스페이스 | Coder UI 또는 `coder stop <workspace>`. `kubectl scale`은 Coder 상태와 어긋나므로 쓰지 않는다 | Longhorn PVC 3개(data·docker·home)에 쓰기가 많다. `coder` Deployment(컨트롤 플레인)만 0으로 내리면 워크스페이스 Pod는 그대로 돈다 |
| qBittorrent | `kubectl scale --replicas=0` | PVC 4개, 다운로드 쓰기 |
| Coder 서버·postgres | 유지 | 쓰기가 적고, 워크스페이스 stop·start에 필요 |

### 실행 위치 (2026-10-20 결정: 메인 PC)

평소 작업 세션은 Coder 워크스페이스(Sysbox) 안의 devcontainer다. 여기서 `kubespray:upgradeCluster`를 돌리면 kubelet·containerd 재시작이나 워크스페이스 정지 때 Ansible도 같이 죽고, 클러스터가 반쯤 업그레이드된 상태로 남을 수 있다. 위의 선행 정지 대상에 워크스페이스가 들어가므로 같은 세션에서는 실행할 수 없다.

| 안 | 내용 | 판단 |
|---|---|---|
| **A (선택)** | 메인 PC에서 Ansible 실행 | 클러스터와 완전히 분리 |
| B | 노드 호스트에 SSH 후 호스트 tmux에서 실행 | 호스트에 Ansible·레포 필요 |
| C | 워크스페이스 devcontainer에서 실행 | 워크스페이스가 흔들리면 중단. 배제 |

메인 PC 준비 (당일 전에 완료):

- [ ] 레포 클론 + `git submodule update --init ansible/third_party/kubespray` (현재 커밋 `867694464`)
- [ ] Python venv에 `requirements.txt` 설치 (ansible 12.3.0, ansible-core 2.19.x)
- [ ] devcontainer `.env`의 `WORKSTATION_*` 변수와 SSH 키(`WORKSTATION_SSH_PRIVATE_KEY_FILE_ABSOLUTE_PATH`)를 메인 PC로 옮겨서 셸 env로 로드
- [ ] SSH 접속 확인: `WORKSTATION_DOMAIN_IPTIME` + `WORKSTATION_BOOTSTRAP_NODE_0_EXTERNAL_SSH_PORT` (22번은 막혀 있음). 사내망에서 DDNS hairpin이 안 되면 `ansible_host`를 노드 내부 IP로 덮어쓴다
- [ ] 리허설: `ansible -i ansible/workstation/inventory/inventory.ini all -m ping -b`
- [ ] `kubectl` (kubeconfig)도 메인 PC에서 동작하는지 확인. 업그레이드 직후 검증을 워크스페이스 재기동 전에 해야 한다

### Phase 1 — 1.35.4 → 1.35.9 (패치, 절차 리허설)

1. `k8s-cluster.yml`의 `kube_version`을 `1.35.9`로 변경
2. `pnpm kubespray:upgradeCluster` 실행 (필요 시 `-e drain_nodes=false`)
3. 검증 (아래 공통 체크리스트)
4. 1~3일 관찰. 문제 없으면 Phase 2

2026-10-20 확정 절차 (위 1~4를 대체하지 않고 구체화):

1. 워크스페이스 세션에서 `kube_version: 1.35.9` 변경을 커밋·푸시 (메인 PC가 같은 커밋을 쓰도록)
2. 메인 PC에서 etcd 스냅샷 재생성 → 호스트 밖 보관
3. Coder 워크스페이스 stop, qBittorrent scale 0
4. 메인 PC에서 `pnpm kubespray:upgradeCluster -e drain_nodes=false` (pnpm이 없으면 `package.json`의 같은 `ansible-playbook` 명령)
5. 메인 PC `kubectl`로 공통 체크리스트 중 노드·kube-system·Cilium·Longhorn 먼저 확인
6. qBittorrent scale 1, Coder 워크스페이스 start → 나머지 체크리스트 (Sysbox 워크스페이스 기동 포함)

### Phase 2 — 1.35.9 → 1.36.5 (minor)

Sysbox가 K8s 1.36을 지원 문서에 넣기 전에는 시작하지 않는다. 2027-01-15까지 미지원이면 이 Phase 대신 런타임 교체 후속 이슈를 연다.

1. 사전 재확인: Phase 1 결과, Sysbox 1.36 지원 등재, submodule 변경 여부, 새 릴리스 노트(1.36.x 패치)
2. `kube_version`을 `1.36.5`로 변경
3. `pnpm kubespray:upgradeCluster`
4. 공통 체크리스트 + 1.36 신규 deprecation 경고 로그 확인
5. 로컬 `kubectl` skew 경고 해소 확인

### Phase 3 — 후속 정리

- [ ] Nova 진단에서 apiserver·scheduler·controller-manager 항목이 사라지는지 확인
- [ ] `docs/diagnosis` 재생성 (Pluto target을 다음 minor로 갱신할지 결정)
- [ ] Sysbox·Longhorn·Cilium 등 호환성 표 확정본 반영
- [ ] 1.37 업그레이드는 별도 이슈로 분리

### 공통 검증 체크리스트 (각 Phase 직후)

- [ ] `kubectl get nodes` Ready, 버전 일치
- [ ] kube-system Pod 전부 Running, 재시작 횟수 급증 없음 (apiserver·etcd·kube-vip VIP 응답)
- [ ] Cilium: `cilium status` 정상, Service·NodePort·L2 announcement(LoadBalancer IP) 동작
- [ ] Longhorn: 모든 볼륨 attached/healthy, CSI Pod 정상, 새 PVC 생성·attach 테스트
- [ ] Istio ambient: ztunnel·istio-cni Ready, `coder`·`goldilocks`·`monitoring` Pod에 `15008` listen (2026-10-12 이슈 검증 방법)
- [ ] Coder 외부 접속 200, Sysbox RuntimeClass 워크스페이스 기동·내부 Docker 실행
- [ ] Vault `VaultConnection` Healthy, VSO 동기화
- [ ] 모니터링 스택(VM·Grafana·OTel) 수집 재개, 알림 오탐 정리
- [ ] GPU: nvidia device plugin·dcgm-exporter 정상, GPU 워크로드 1개 기동
- [ ] `pulumi preview` (`k8s-workstation-system`, `k8s-workstation-tools`) 드리프트 없음

### 롤백

kubeadm은 minor 다운그레이드를 지원하지 않는다. 실패 시 복구는 (1) 같은 minor 내 재실행, (2) etcd 스냅샷 복원, (3) 하드 백업 기반 재구축 순이다. 따라서 Phase 2 전에 etcd 복원 절차를 한 번 문서로 확인해 둔다.

## 수용 기준

- [ ] 서버 버전 v1.36.x, `kubectl version` skew 경고 없음
- [ ] 공통 검증 체크리스트 전부 통과
- [ ] `k8s-cluster.yml`의 `kube_version`이 실제 버전과 일치
- [ ] 호환성 확인 결과가 이 문서에 기록됨

## 범위 밖

- Kubernetes 1.37 업그레이드 (별도 이슈)
- Sysbox 대체 런타임 선정·이전 (2027-01-15에 1.36 미지원이 확인될 때 후속 이슈)
- Cilium 1.21, CoreDNS·nodelocaldns·kube-vip 이미지 최신화 (Nova 항목. K8s 업그레이드와 분리해 순차 진행)
- 노드 증설·HA 구성

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-13 | 등록. 현황 실측(노드·Kubespray 지원 버전·CNI) 후 2단계(1.35.9 → 1.36.5) 계획 작성 |
| 2026-10-13 | Phase 1 착수일을 2026-10-30으로 확정. 그 전에 Phase 0(백업·etcd 스냅샷·호환성 표·drain 정책) 완료 |
| 2026-10-13 | Sysbox 공식 지원은 K8s 1.32~1.35뿐 ([install-k8s.md](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/install-k8s.md)). 1.36 요청 [#1036](https://github.com/nestybox/sysbox/issues/1036)은 open. Phase 2 착수 금지. K8s 1.35는 2026-12-28 maintenance, EOL 2027-02-28. 2027-01-15까지 1.36 지원이 없으면 Sysbox를 버리고 다른 런타임으로 이전 |
| 2026-10-15 | Longhorn 볼륨 엔진 `v1.13.0`은 10-13 일괄 완료로 종료. 수요일 분할 일정·Phase 1 겹침 회피 문구 제거. Jellyfin VolumeSnapshot clone PVC는 pCloud 백업 이슈와 분리 |
| 2026-10-20 | Phase 0 진행. 사용자 하드 백업 완료, 1인 클러스터라 사전 공지 생략. 호환성 표 작성: Phase 1 차단 없음, Phase 2 차단은 Sysbox뿐. Argo Rollouts v1.10.1(e2e 1.35까지)·kube-vip은 Phase 2 전후 재확인 |
| 2026-10-20 | 1.36 deprecation·removal 대조, 노드·Kubespray 설정 대조 완료. 차단 항목 없음. istio-ingressgateway의 Service `externalIPs`는 1.36에서 경고만 나오며, 제거 일정이 나오면 후속 이슈로 분리 |
| 2026-10-20 | etcd 스냅샷 생성·검증(revision 82072356), 현재 클러스터 상태·이미지 기록. 저장 위치는 `tmp/etcd-snapshot/` (같은 디스크라 호스트 밖 복사는 사용자 몫). Phase 1 당일 재스냅샷 예정 |
| 2026-10-20 | drain 정책 확정(drain 생략 + Coder 워크스페이스 stop + qBit scale 0). 작업 세션이 Coder 워크스페이스 안의 devcontainer라서 Ansible 실행 위치를 메인 PC로 확정. 메인 PC 준비 항목 추가. 작업 시간대는 미정 |
| 2026-10-20 | 작업 시간대 항목은 1인 클러스터라 해당 없음으로 정리. 남은 Phase 0 항목은 메인 PC 준비, 당일 etcd 재스냅샷 |
| 2026-10-20 | 10-20 etcd 스냅샷 호스트 밖 복사 완료 (사용자) |
