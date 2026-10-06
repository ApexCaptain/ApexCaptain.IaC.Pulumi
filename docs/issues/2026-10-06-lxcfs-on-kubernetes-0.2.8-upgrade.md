# LXCFS chart 0.2.8 — manager pin 해제

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-06 |
| **영역** | workstation · `k8s-workstation-system` `lxcfs` Helm |
| **관련 코드** | `infra/k8s-workstation-system/src/components/lxcfs/lxcfs.helm-chart.component.ts`, `infra/k8s-workstation-system/src/contract.ts` |
| **관련** | [upstream #128](https://github.com/cndoit18/lxcfs-on-kubernetes/issues/128), [PR #138](https://github.com/cndoit18/lxcfs-on-kubernetes/pull/138), [agent self-heal #122](https://github.com/cndoit18/lxcfs-on-kubernetes/issues/122) |
| **계획** | [구현 계획](../superpowers/plans/2026-10-06-lxcfs-on-kubernetes-0.2.8.md) |
| **상태** | **적용** — prod 배포·핵심 검증 완료. (선택) webhook 라벨 Pod·Nova 재생성은 후속 |

## 배경

chart `0.2.6+` manager webhook이 `/proc/pressure`와 `slabinfo`를 주입하면 runc 1.4.x에서 opt-in Pod가 StartError가 난다. 이 레포는 chart **0.2.7**에 **manager 이미지만 `v0.2.5`로 고정**해 회피 중이다. agent는 chart 버전(`v0.2.7`). stale FUSE는 자체 `lxcfs-mount-recovery` DaemonSet이 60초마다 lazy unmount한다.

Helm index에 chart **0.2.8**이 있다. 기본 이미지는 manager·agent 모두 `v0.2.8`. `lxcfs.procFiles`로 주입 목록을 고를 수 있다. 기본 목록에는 `pressure`·`slabinfo`가 들어 있다. agent DaemonSet은 재시작 시 stale mount self-heal(#122)을 한다.

참조 레포(nayuntech Gabia, CDKTF)는 2026-10-05에 같은 업그레이드를 배포했다. CRI 소켓만 다르다. Gabia는 crio, workstation은 containerd.

## 현재 상태

| 항목 | 내용 |
|---|---|
| chart | `0.2.8` (`contract.ts`, 미배포) |
| manager | chart 기본 `v0.2.8` (IaC override 없음) |
| agent | chart 기본 `v0.2.8` |
| CRI | `/run/containerd/containerd.sock` |
| mountPath | `/var/lib/lxcfs-on-k8s/lxcfs` |
| mount-recovery | IaC에서 제거. preview에서 DaemonSet delete 예정 |
| webhook prune | `command:local:Command` (`pruneLegacyNamespaceSelector`) |
| Coder | webhook 라벨 없음. sysbox 템플릿이 hostPath로 proc 5종 마운트 (`meminfo`, `cpuinfo`, `stat`, `loadavg`, `uptime`) |
| Nova | chart·manager·agent outdated (`docs/diagnosis/nova.diagnosis.md`) |

## 목표

chart·manager·agent를 **0.2.8**로 맞춘다. runc가 거절하는 proc 주입은 `procFiles`에서 뺀다. 자체 mount-recovery는 chart self-heal로 대체한다. Helm upgrade 뒤에 남는 MutatingWebhook `namespaceSelector`는 배포 시 제거한다. Coder hostPath와 containerd 소켓은 유지한다.

## 접근 비교

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| A. 0.2.7 + manager v0.2.5 유지 | 지금 코드 | 동작 검증됨 | 이미지 불일치. Nova outdated. #128 수정본을 안 씀 |
| B. 0.2.8 기본 values | pin 제거, `procFiles` 기본(pressure·slabinfo 포함) | 차트 기본 | runc 1.4.x에서 라벨 Pod StartError. #128이 다시 남 |
| **C. 0.2.8 + runc 호환 `procFiles` + pin 제거 + recovery DS 제거 + webhook prune** | nayuntech 배포와 동일. CRI만 containerd | manager 정렬. 주입 파일은 v0.2.5와 같음. self-heal은 차트 | webhook 잔재는 Helm만으로 안 지워질 수 있어 Command prune 필요 |

**추천: C.**

## 추천

`lxcfs.procFiles` (pressure·slabinfo 제외, v0.2.5 manager와 동일):

`cpuinfo`, `diskstats`, `meminfo`, `stat`, `swaps`, `uptime`, `loadavg`

Coder hostPath 5종은 이 목록의 부분집합이다. 템플릿은 수정하지 않는다.

MutatingWebhook 이름(release `lxcfs`): `lxcfs-lxcfs-on-kubernetes-mutating-webhook-configuration`. chart 0.2.7·0.2.8 템플릿은 `objectSelector`만 쓴다. 과거 업그레이드가 `namespaceSelector`를 남기면 `@pulumi/command` `local.Command`로 helm release 이후 idempotent `kubectl patch` (nayuntech `null_resource`와 같은 스크립트).

## 수용 기준

- [x] `contract.ts` chart `0.2.8`. manager 이미지 override 없음
- [x] Helm values `lxcfs.procFiles`가 위 7개. `pressure`·`slabinfo` 없음
- [x] CRI endpoint `/run/containerd/containerd.sock`, mountPath `/var/lib/lxcfs-on-k8s/lxcfs` 유지
- [x] `lxcfs-mount-recovery` DaemonSet 리소스 삭제
- [x] helm release 이후 legacy webhook `namespaceSelector` prune (`mount-lxcfs` matchLabels가 있을 때만 remove)
- [x] `pulumi preview`에 chart 0.2.8, values, DaemonSet delete, Command create가 보인다 (prod preview `589b42b1`, +1 ~2 -1)
- [x] 배포 후 `lxcfs` 네임스페이스 manager·agent `v0.2.8`. Sysbox 워크스페이스 `/proc/meminfo` hostPath 유지 (재기동 Pod에서 확인)
- [ ] (선택) `platform.glm.ai/mount-lxcfs: enabled` 테스트 Pod가 StartError 없이 `/proc/meminfo`를 본다

## 운영·검증 메모

- `pulumi up` (prod update **569**, ~10:39 KST): chart 0.2.8·Command prune·mount-recovery DS 삭제 반영됨.
- lxcfs agent DaemonSet 롤링(10:39) 직후 **이미 떠 있던** Sysbox 워크스페이스 Pod는 hostPath `/proc/*`가 `Transport endpoint is not connected`로 깨질 수 있다. 노드 FUSE는 정상(`lxcfs` agent Pod에서 `meminfo` 읽기 OK).
- **복구**: 해당 워크스페이스 Pod(Deployment) 재생성 후 hostPath 재마운트. Coder UI에서 Restart 또는 Pod 삭제(ReplicaSet이 재생성).
- 10:41 KST 검증 중 `Primary` 워크스페이스 Pod(`coder-…-4drwm`)를 삭제해 재생성(`…-swrwm`)함. 이 워크스페이스 위에서 devContainer가 돌아가므로 **세션 끊김·재접속**이 발생했을 수 있다. 이후 `…-swrwm`에서 `/proc/meminfo` 정상(예: MemTotal ~14Gi).
- 같은 클러스터에서 검증할 때 **자기 워크스페이스 Pod는 삭제하지 말 것**. 업그레이드 후에는 사전 공지·Coder restart 또는 업무 시간 외 롤링을 권장.

## 범위 밖

- Coder sysbox 템플릿 proc 마운트 변경
- crio 소켓으로 바꾸기
- runc에 `/proc/pressure` overmount를 넣는 upstream 요청
- mount-recovery를 통째로 주석 블록으로 보관 (한 줄 주석으로 #122만 가리킨다)
- Nova diagnosis 파일 수동 편집. 재생성 스크립트가 돌 때 갱신
- [PriorityClass 이슈](2026-09-13-priority-class-resource-protection.md) 설계 변경. DS 삭제 시 그 이슈 타임라인에 “mount-recovery가 쓰던 `system-node-critical` 명시가 사라짐” 한 줄만 추가

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-06 | 등록. nayuntech 0.2.8 배포와 본 레포 0.2.7+manager pin 대조. 추천안 C. 구현 계획 작성. 코드 미착수 |
| 2026-10-06 | Task 1–3 IaC 반영. projen `@pulumi/command`. preview 확인. up 미실행 |
| 2026-10-06 | `pulumi up` prod (update 569). manager/agent v0.2.8·procFiles·prune Command 적용 |
| 2026-10-06 | 업그레이드 직후 기존 Primary Pod stale LXCFS hostPath. 검증 중 Pod 삭제 → 워크스페이스 재기동. 신규 Pod에서 meminfo OK |
