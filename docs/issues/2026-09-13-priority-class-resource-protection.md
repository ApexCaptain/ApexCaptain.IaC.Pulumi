# 단일 노드 PriorityClass 및 kubelet eviction 가드레일

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-13 |
| **재검토 예정** | **2026-12 초** — 그때 IaC·Ansible 착수. 그 전 적용 없음 |
| **영역** | workstation-0 단일 노드. `k8s-workstation-system/tools/apps` · Coder 템플릿 · Kubespray kubelet |
| **관련 코드** | `infra/k8s-workstation-system` (우선순위 클래스·Helm), `infra/k8s-workstation-tools` (qBit, Coder `assets/coder/sysbox-ubuntu/*/main.tf`), `ansible/workstation/inventory/group_vars/k8s_cluster/k8s-cluster.yml` |
| **관련 이슈** | [VPA 리소스 재조정](2026-09-08-vpa-resource-rightsizing-followup.md) — qBit 등 request 축소는 그쪽. 이 이슈는 축출 순서·kubelet 가드레일 |
| **상태** | **보류** — 2026-12 초까지 설계만 유지. 그때 진행 |

## 배경

workstation-0은 물리 RAM ~48GB(capacity ~46Gi) 단일 노드다. limits 합은 capacity를 넘는 overcommit. Coder 워크스페이스 피크(과거 ~11Gi), qBittorrent(request 4Gi / limit 8Gi), Jellyfin 트랜스코딩이 플랫폼 워크로드와 같은 노드에 있다.

2026-09-12 메모리 증설 이후 당장 MemoryPressure는 없다. 구조는 그대로라 피크가 겹치면 kubelet eviction 또는 커널 OOM이 난다. 미지정 Pod는 priority 0이라, 그때 누가 죽는지가 정해져 있지 않다. 축출 순서와 kubelet 가드레일 설계는 본 이슈가 SSOT다.

## 문제

1. PriorityClass가 거의 없다. IaC에서 명시하는 건 LXCFS mount-recovery의 `system-node-critical`뿐.
2. 커널 OOM은 PriorityClass를 보지 않는다. `oom_score_adj`는 QoS와 memory request 비율이다. 지금 Vault request 128Mi, qBit request 4Gi라 커널이 먼저 개입하면 의도와 반대로 Vault 쪽이 더 잘린다.
3. kubelet eviction도 “낮은 priority 먼저”가 아니다. **request를 넘긴 Pod가 먼저**이고, 그 안에서 priority. qBit는 request 4Gi·실사용 수백 Mi라 `-100`을 줘도 축출 후보가 안 된다.
4. 클러스터에 이미 `k8s-cluster-critical`(1000000000), `longhorn-critical`(1000000000)이 있다. 같은 값의 `platform-critical`을 추가하면 순서가 없다.

## 현재 상태

| 항목 | 내용 |
|---|---|
| 노드 | workstation-0, K8s 1.35.4, RAM ~46Gi allocatable |
| 기존 PriorityClass | `system-node-critical` 2000001000, `system-cluster-critical` 2000000000, `k8s-cluster-critical` 1000000000 (Kubespray), `longhorn-critical` 1000000000 (Longhorn Helm) |
| kubelet reserved/eviction | `ansible/workstation/.../k8s-cluster.yml`에 미설정 |
| 플랫폼 QoS | Vault 등 대다수 Burstable (request < limit) |
| 희생 후보 request | qBit 4Gi (VPA ~283Mi, 과다). Coder는 limit/4 request라 피크 시 초과하기 쉬움 |

## 목표

메모리 압박 시 영향 범위를 “클러스터 다운”이 아니라 “Coder·qBit 재시작”으로 줄인다. 보호 대상 working set이 `(capacity − reserved − eviction threshold)` 안에 들어가게 한다.

PriorityClass는 보조다. 본체는 kubelet이 커널 OOM보다 먼저 움직이게 하는 것과, 희생 워크로드가 request를 넘게 하는 것이다.

## 접근 비교

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| A. 5티어 신설 (`platform-critical` 1e9 포함) | 커스텀 3개 + 빌트인 + default 0 | 이름이 설명적 | 기존 1e9와 충돌. Longhorn을 `system-node-critical`로 올리면 CNI와 경쟁. 티어 과다 |
| B. 클래스만 부여, requests/QoS/kubelet 그대로 | Coder·qBit에 음수 priority | 변경 작음 | qBit는 request 안에 있어 축출 안 됨. OOM 시 Vault가 더 취약 |
| **C. 빌트인·기존 1e9 재사용 + 음수 1개 + kubelet 가드레일 + 보호 대상 Guaranteed** | 아래 추천 | 충돌 없음. eviction이 커널보다 앞. OOM 점수와도 맞음 | Ansible kubelet 변경 필요. 플랫폼 request=limit은 숫자 검증 필요 |

**추천: C.**

## 추천

### 클래스 (3 + 빌트인. 5단계 커스텀 폐기)

| 클래스 | value | preemption | 대상 |
|---|---|---|---|
| 빌트인 `system-node-critical` / `system-cluster-critical` | 기존 | 기존 | Cilium, CoreDNS, Istio CNI, LXCFS. **Longhorn 넣지 않음** |
| 기존 `k8s-cluster-critical` / `longhorn-critical` | 1000000000 재사용 | 기존 | Vault, istiod, ztunnel, Longhorn. **새 `platform-critical` 만들지 않음** |
| 신규 `workload-batch` | `-1` 또는 `-100` | `Never` | Coder 워크스페이스, qBittorrent, 백업 Job |
| 미지정 | 0 | — | Authentik, ingress, CNPG, 앱, 관측. `platform-standard` / `workload-standard` / `globalDefault` 불필요 |

관측 스택을 앱보다 살리는 건 후속. 필요해지면 `ops-standard`(예: 1000) 하나만 추가한다.

### kubelet (Ansible/Kubespray)

`ansible/workstation/inventory/group_vars/k8s_cluster/k8s-cluster.yml`에 eviction-hard/soft와 kube-reserved / system-reserved를 넣는다. 출발점 예: hard `memory.available<2Gi`, soft `<4Gi`, reserved 각 2Gi. 적용 전 Kubespray·현재 kubelet 플래그와 겹치는지 확인. 중복이면 덮어쓰지 않는다.

### QoS

- 보호 대상(Vault, istiod, ztunnel, Longhorn manager): request≈limit (Guaranteed), 실측에 맞게.
- 희생 대상 request 축소(qBit 4Gi 등): **이 이슈에서 하지 않는다.** [VPA 리소스 재조정](2026-09-08-vpa-resource-rightsizing-followup.md) 2026-10 초 재검토에서.

### 적용 순서

1. kubelet reserved / eviction (가드레일이 없으면 클래스가 OOM을 못 이긴다)
2. `k8s-workstation-system`에 `workload-batch` 생성. Helm이 참조하기 전에 존재해야 함 (`dependsOn`)
3. Coder 템플릿(`main/main.tf`, `test/main.tf`)·qBit에 `priorityClassName: workload-batch`
4. Vault / istiod / ztunnel에 기존 `k8s-cluster-critical` 부여. Longhorn은 차트 기본 `longhorn-critical` 유지
5. 보호 대상 Guaranteed는 실측 숫자 확인 후. 추측으로 limit을 request에 맞추지 않음

Helm values 필드명은 사용 중 차트 버전으로 확인한다. `pilot.cni.enabled` 형태는 현재 Istio ambient 배포(`base → cni → istiod → ztunnel`)와 다르다.

## 수용 기준

- [ ] 2026-12 초(또는 그 이후)에 재개. 그 전 IaC·Ansible 적용 없음
- [ ] 클러스터에 `workload-batch`(음수, `preemptionPolicy: Never`)가 있다. `platform-critical` 1e9는 없다
- [ ] Coder 워크스페이스 Pod와 qBittorrent가 `workload-batch`를 쓴다
- [ ] Vault / istiod / ztunnel이 `k8s-cluster-critical`(또는 동등한 기존 1e9)를 쓴다. Longhorn은 `system-node-critical`이 아니다
- [ ] kubelet eviction-hard와 reserved가 설정되어 있고, 기존 Kubespray 플래그와 충돌하지 않는다
- [ ] 보호 대상 working set 합이 `(capacity − reserved − hard threshold)` 안에 들어간다는 계산이 이슈 또는 PR에 있다
- [ ] `pulumi preview`/`up` 후 해당 Pod Ready. kubelet 변경은 Ansible 적용 후 노드 Ready

## 범위 밖

- qBit / Jellyfin / Coder **request 값 변경** — VPA 이슈. 10월 초 전 축소 없음
- 관측 스택 전용 `ops-standard` — 후속. 이 이슈에서 클래스 추가하지 않음
- cert-manager를 critical로 올리는 것. 이미 발급된 인증서는 유지된다
- VPA updater/admission, MemoryQoS, LimitRange, ResourceQuota
- Longhorn을 `system-node-critical`로 승격
- “백본 100% 생존”을 수용 기준으로 쓰는 것

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-13 | 등록. 추천안 C. IaC 미착수 |
| 2026-09-13 | 재검토를 2026-12 초로 확정. 그 전 적용 없음. 상태 보류 |
| 2026-09-13 | 출처 표기 제거. 이 이슈가 SSOT |
