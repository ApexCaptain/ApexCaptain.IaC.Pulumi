# 열린 이슈 일정

`docs/issues/active/` 기준. 날짜가 있는 확인·재개만 달력에 넣고, 나머지는 트리거 대기.

원문·수용 기준은 각 이슈 문서. 이 표는 언제 무엇을 볼지만.

---

## 달력

| 언제 | 할 일 | 이슈 | 상태 |
|---|---|---|---|
| **2026-10-30 (금)** | (Kata PoC 전. 10-21 업그레이드·qBit 변경이 VPA 8일 윈도에서 빠지는 날) VPA·Goldilocks 재스냅샷 → 갭 재분석. 안전한 항목만 IaC 패치. jellyfin / qbittorrent / coder는 피크·upperBound 교차 확인 | [VPA 리소스 재조정](issues/active/2026-09-08-vpa-resource-rightsizing-followup.md) | 적용 · 2026-10-05 1차 반영 완료 |
| **2026-10-31 ~ 11-01 (토·일)** | Kata PoC 착수: Sysbox 0.7.1, Kubespray `kata_containers_enabled`(메인 PC, etcd 스냅샷 선행), RuntimeClass `kata`, 테스트 템플릿 변형. PoC 1단계(ClusterIP 접근)부터. 11-02 07:00 라우터 재부팅 전 종료 | [Sysbox 대체 런타임](issues/active/2026-10-24-sysbox-runtime-replacement.md) | 조사중 |
| **2026-11 초** | projen `CronScheduleOptions` / 이슈·PR 재검색. 없으면 업스트림 이슈 등록. 타입 생기면 `as any` 제거 여부 결정 | [Projen schedule timezone](issues/active/2026-09-09-projen-workflow-schedule-timezone.md) | 보류 |
| **2026-12 초** | Kata PoC 결과 정리 (Sysbox 0.7.1, `coder-sysbox-ubuntu-test`에서 Kata 워크스페이스 기동, 2순위 userns dockerd 확인). 2027-01-15 판단 근거 | [Sysbox 대체 런타임](issues/active/2026-10-24-sysbox-runtime-replacement.md) | 조사중 |
| **2026-12 초** | kubelet eviction/reserved → `workload-batch` → Coder/qBit 부여 → 플랫폼은 기존 1e9 재사용. 11월 VPA 결과가 있으면 같이 보고 착수. 그 전 적용 없음 | [PriorityClass·eviction](issues/active/2026-09-13-priority-class-resource-protection.md) | 보류 |
| **2027-01-15** | Sysbox 지원 문서에 K8s 1.36이 있는지 확인. 없으면 Sysbox 폐기 후 다른 런타임으로 이전 (1.35 maintenance 2026-12-28, EOL 2027-02-28) | [Kubernetes 1.36 업그레이드](issues/active/2026-10-13-kubernetes-1-36-upgrade.md) | 보류 |
| **2027-01 말** | Vault CA 회전 방법론 재검토: A 적용 결과, 정기 회전 필요성, ①②(trust-manager 배포·VSO Reloader) 또는 ①②③(옛·새 CA 병행) 도입 여부 | [Vault CA 회전 신뢰 전파](issues/active/2026-10-25-vault-ca-rotation-trust-propagation.md) | 진행중 |

12월 PriorityClass는 11월 VPA 주기 결과를 함께 본다. Longhorn 1.13 엔진 업그레이드는 **완료** ([resolved](issues/resolved/2026-10-07-longhorn-1-13-0-upgrade.md)) — K8s Phase 1은 2026-10-21 완료.

---

## 날짜 없음 (트리거 대기)

| 트리거 | 할 일 | 이슈 | 상태 |
|---|---|---|---|
| [envoyproxy/envoy#45198](https://github.com/envoyproxy/envoy/pull/45198) 머지 + 사용 중 Istio `proxyv2` 포함, [istio/istio#60074](https://github.com/istio/istio/issues/60074) 클로즈 | Jellyfin을 ambient로 되돌린 뒤 Direct Play 시크 스트레스. sidecar injection만 제거하고 PeerAuthentication / AuthorizationPolicy는 유지 | [Jellyfin ambient Direct Play](issues/active/2026-08-17-jellyfin-ambient-mesh-direct-play-seek.md) | 완화 |
| 사용자 재개 결정 (2026-10-19 보류. protect 선행은 충족) | 클러스터 도달·자격 증명 결정 → 일일 drift 감지 → PR preview | [CI preview·drift](issues/active/2026-10-17-ci-pulumi-preview-drift.md) | 보류 |
| K8s 1.36 업그레이드 완료 | system contract phase 모듈 분해 (URN 불변) | [contract 분해](issues/active/2026-10-17-system-contract-split.md) | 보류 |
| 컴포넌트 단위 **트리거 충족** (protect 해결 2026-10-17) / contract 단위는 contract 분해 후 | Pulumi mocks 컴포넌트 테스트 3개+ | [infra 테스트](issues/active/2026-10-17-infra-component-tests.md) | 보류 |
| pCloud 백업 복원 검증 착수 | 재구축·복원 런북 작성 + 실복원 1회 | [DR 런북](issues/active/2026-10-17-dr-rebuild-runbook.md) | 보류 |
| [jellyfin-plugin-sso](https://github.com/9p4/jellyfin-plugin-sso) manifest에 Jellyfin 12 `targetAbi` 버전 등장 | 플러그인 호환 확인 → config 백업 → 차트 3.4.0+ (앱 12.x) 업그레이드 → 재스캔 → SSO 확인 | [Jellyfin 12 업그레이드](issues/active/2026-10-21-jellyfin-12-upgrade.md) | 보류 |
| develop 머지 | `docs-issue-mirror` workflow 첫 실행 확인 → Issue 49개 생성·resolved close·재실행 no-op 확인 | [GitHub Issues 미러](issues/active/2026-10-27-github-issues-mirror.md) | 진행중 |
| CI가 GitOps `main`에 이미지 태그 자동 push 시작 | `repos/gitops` behind 상태에서 commit 시 guard hook deny 실확인 → 통과 시 `docs/issues/resolved` 이동 | [GitOps 로컬 클론](issues/active/2026-10-21-gitops-repo-local-clone.md) | 적용 |
---

## 갱신

이슈 상태가 바뀌거나 날짜가 확정되면 이 파일과 해당 이슈를 같이 고친다. 아카이브된 항목은 여기서 지운다.
