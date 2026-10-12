# 노드 재부팅 후 ambient 리다이렉트 유실

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-12 |
| **영역** | Istio ambient, `istio-cni`, Cilium 체인 |
| **관련 코드** | `infra/k8s-workstation-system/src/components/istio/` |
| **계획** | `docs/superpowers/plans/2026-10-12-ambient-reboot-cni-repair.md` |
| **상태** | **진행중** — 코드·preview 완료. `pulumi up`과 재부팅 실측 전 |

## 배경

2026-10-12 13:16 KST 전후 `workstation-0` 재부팅 뒤 `https://coder.ayteneve93.com/` 이 Envoy 503이었다. Coder 파드는 Ready였고 앱 포트 health는 200이었다. 게이트웨이 upstream은 `envoy://connect_originate/<coder-pod-ip>:8080`, 플래그는 `URX,UF`, reset reason은 `delayed_connect_error:_Invalid_argument`.

`coder` 네임스페이스는 `istio.io/dataplane-mode=ambient` 이고, 깨진 파드 netns에는 `15008` listen과 `ISTIO_*` iptables가 없었다. 어노테이션 `ambient.istio.io/redirection=enabled` 는 남아 있었다. kubelet probe는 앱 포트만 보므로 Ready와 게이트웨이 경로는 따로다.

같은 상태였던 파드:

| 네임스페이스 | 파드 | 컨트롤러 |
|---|---|---|
| `coder` | `coder-65cdc5d564-jkhqx` | Deployment `coder` |
| `goldilocks` | `goldilocks-dashboard-588cc57c68-8sg8p` | Deployment `goldilocks-dashboard` |
| `monitoring` | `loki-canary-hqqhn` | DaemonSet `loki-canary` |

13:52 KST에 세 컨트롤러를 rollout restart 해서 복구했다. 새 파드 netns에 `15008`이 있다. 이 재시작은 응급 조치이고 IaC에 없다.

Longhorn CSI가 부팅 직후 한 차례 `driver.longhorn.io not found`로 attach에 실패한 건 인접 사건이다. 마운트는 이후 성공했고, 503은 파드 Ready 이후에도 계속됐다.

## 문제

노드는 한 대라 재부팅마다 kubelet이 ztunnel보다 일반 파드를 먼저 띄운다. 빠지는 경로는 둘이다.

1. Cilium이 `05-cilium.conflist`를 다시 쓰면서 체인에서 `istio-cni`가 빠진다. 지금 `ISTIO_OWNED_CNI_CONFIG=false` 라 Istio가 Cilium 파일 안에 체인을 끼운다. `cni.exclusive=false`는 Cilium 자기 파일 재작성을 막지 못한다.
2. `AMBIENT_RECONCILE_POD_RULES_ON_STARTUP=true` 는 기동 때 한 번이다. netns가 아직 없으면 `can't find netns for pod` 로 포기하고 재시도하지 않는다. ztunnel이 뜨기 전 `cmdAdd`는 `no ztunnel connection` 500이다. kubelet이 샌드박스를 다시 만들면 그때 등록된다. 샌드박스와 파드 객체가 그대로면 `15008` 없이 Ready로 남는다.

커뮤니티: [istio/istio#60882](https://github.com/istio/istio/issues/60882) (open, 2026-10-06 갱신). 1.29.5, 1.30.3, 단일 노드 k3s + Cilium 1.31.0-rc.0에서 재현. 1.30.5 릴리스 노트에는 이 수정이 없다. 1.30.5가 고친 ambient 항목은 iptables backend flip-flop ([istio/istio#61020](https://github.com/istio/istio/issues/61020))이다. 같은 진단의 [#55968](https://github.com/istio/istio/issues/55968)은 stale로 닫혔고, 코드는 1.30까지 같다는 후속 댓글이 있다.

## 접근 비교

| 접근 | 이번 구멍 | 비용 |
|---|---|---|
| `istioOwnedCNIConfig: true` | conflist 덮어쓰기만 닫힘. 샌드박스가 그대로인 파드는 남음 | Helm values 한 줄 |
| 부팅당 `istio-cni-node` 1회 재시작 | 기존 netns에 규칙을 다시 넣음. 커뮤니티에서 컨테이너 ID가 유지된 채 `ISTIO` 규칙이 0에서 복구됨 | 작은 DaemonSet. 재시작 몇 초 동안 새 파드 `cmdAdd`가 500 |
| `15008` 없는 앱 파드 삭제 | 새 샌드박스로 CNI ADD가 다시 돔 | Coder 세션이 끊김. 위 재시작으로 같은 복구가 됨 |
| `REPAIR_DELETE_PODS=true` | 사이드카 init `istio-validation`만 봄. ambient에는 그 init이 없음 | 해당 없음 |
| `ENABLE_AMBIENT_DETECTION_RETRY=true` | `cmdAdd`의 ambient 판정 재시도. 복원된 파드 reconcile과 무관. #60882 재현에서 배제됨 | 해당 없음 |
| ztunnel `system-node-critical` | 이미 적용됨. 재부팅 후 이미 스케줄된 파드의 kubelet 시작 순서는 바꾸지 못함 | 해당 없음 |
| Istio 업그레이드 | 1.31.0-rc.0에서도 재현 | 지금 수정이 아님 |

## 추천

두 가지를 같이 넣는다. 1번만으로는 부족하다.

1. `istio-cni` Helm values에 `istioOwnedCNIConfig: true`. 전용 conflist `02-istio-cni.conflist`에 `cilium-cni` 다음 `istio-cni`. startup reconcile은 끄지 않는다.
2. ztunnel이 Ready가 된 뒤 60초를 기다리고, 그 부팅에서 `istio-cni-node` 파드를 한 번만 삭제한다. DaemonSet가 다시 만들면 reconcile이 이미 있는 netns를 잡는다. 앱 파드는 삭제하지 않는다. 같은 boot id면 다시 지우지 않는다.

구현 절차는 계획 문서.

## 수용 기준

- [ ] `istio-system/istio-cni-config`의 `ISTIO_OWNED_CNI_CONFIG`가 `true`
- [ ] 노드 `/etc/cni/net.d/02-istio-cni.conflist`에 `cilium-cni`와 `istio-cni`가 둘 다 있다
- [ ] `AMBIENT_RECONCILE_POD_RULES_ON_STARTUP`은 `true`로 유지
- [ ] 수리 DaemonSet가 ztunnel Ready 이후 60초 뒤에 `k8s-app=istio-cni-node` 파드를 부팅당 한 번만 삭제한다
- [ ] 같은 boot id로 수리 파드가 다시 떠도 `istio-cni-node`를 또 지우지 않는다
- [ ] 앱 파드, Coder, goldilocks, loki-canary를 지우는 권한은 없다

재부팅 실측은 다음 노드 재부팅 때다. 그 전에 이 이슈를 닫지 않는다. 기대는 ambient 파드 netns에 `15008`이 있거나, 빠진 파드가 수리 재시작 이후 1–2분 안에 규칙을 받는 것이다. `https://coder.ayteneve93.com/` 은 503이 아니다.

## 범위 밖

- `REPAIR_DELETE_PODS`, `ENABLE_AMBIENT_DETECTION_RETRY` 변경
- 앱 파드를 지우는 루프
- Coder만의 예외
- Istio 마이너 업그레이드
- 인그레스 `URX,UF` 알림. 감지는 후속이고 이 수정의 예방이 아니다
- Jellyfin Direct Play 시크 ([2026-08-17](2026-08-17-jellyfin-ambient-mesh-direct-play-seek.md)). HBONE 스트림 누수이고 이번 재부팅 미등록과 다르다

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-12 | 재부팅 후 Coder 503. rollout restart로 복구. #60882와 대조해 owned CNI config + 부팅당 istio-cni 1회 재시작으로 결정. 이슈 등록 |
| 2026-10-12 | 코드 작성. tsc, eslint, 셸 테스트 `ok`. preview `prod`: create 6, update 1 (`istio-cni` values). 다른 드리프트 없음. `pulumi up` 안 함. 수리 컨테이너는 `main` 성공 뒤 `sleep infinity`. 바로 종료하면 마커가 있어도 kubelet 재시작만 반복된다 |
