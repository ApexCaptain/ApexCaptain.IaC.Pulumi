# 열린 이슈 일정

`docs/issues/` 기준. 날짜가 있는 확인·재개만 달력에 넣고, 나머지는 트리거 대기.

원문·수용 기준은 각 이슈 문서. 이 표는 언제 무엇을 볼지만.

---

## 달력

| 언제 | 할 일 | 이슈 | 상태 |
|---|---|---|---|
| **2026-10-22** | Authentik CNPG 컷오버 후 auth·`authentik-db` Healthy 재확인. 통과 시 `data-authentik-postgresql-0` PVC 수동 삭제·백업 이슈 표 정리 | [Authentik Bitnami PVC 정리](issues/2026-10-13-authentik-bitnami-pvc-cleanup.md) | 보류 |
| **2026-10-25 19:03 KST** | leaf 갱신 (`vault-server-certificate` renewalTime 10:03:36Z). Reloader가 vault-0를 롤했는지, 롤 후 `VaultConnection` Healthy·서비스 DNS TLS 유지되는지. 통과하면 `docs/resolved`로 이동 | [Vault TLS cert reload](issues/2026-09-06-vault-tls-cert-reload.md) | 적용 · 실검증 대기 |
| **2026-10-30** | K8s 1.35.4 → 1.35.9 (Phase 1) 착수. 전에 Phase 0 완료. Phase 2(1.36)는 Sysbox가 1.36을 지원 문서에 넣기 전 착수 금지 | [Kubernetes 1.36 업그레이드](issues/2026-10-13-kubernetes-1-36-upgrade.md) | 보류 |
| **2026-10-31 이후** | qBit·Jellyfin v3 라이브 확인 후 `SftpV1Component`·테스트·export 삭제. 그 전 삭제 없음 | [SftpV1 삭제](issues/2026-09-10-sftp-v1-removal.md) | 보류 |
| **2026-11 초** | VPA·Goldilocks 재스냅샷 → 갭 재분석. 안전한 항목만 IaC 패치. jellyfin / qbittorrent / coder는 피크·upperBound 교차 확인 | [VPA 리소스 재조정](issues/2026-09-08-vpa-resource-rightsizing-followup.md) | 적용 · 2026-10-05 1차 반영 완료 |
| **2026-11 초** | projen `CronScheduleOptions` / 이슈·PR 재검색. 없으면 업스트림 이슈 등록. 타입 생기면 `as any` 제거 여부 결정 | [Projen schedule timezone](issues/2026-09-09-projen-workflow-schedule-timezone.md) | 보류 |
| **2026-11 초** | rulesync `26.0.0` 고정 재검토. 2주 이상 지난 최신 버전 release notes → 플랜 Task 5 검증(verify·probe·`ai:check`) 통과 시에만 버전 올림 | [AI 에이전트 설정 rulesync](issues/2026-10-17-ai-agent-config-rulesync.md) | 적용 |
| **2026-12 초** | kubelet eviction/reserved → `workload-batch` → Coder/qBit 부여 → 플랫폼은 기존 1e9 재사용. 11월 VPA 결과가 있으면 같이 보고 착수. 그 전 적용 없음 | [PriorityClass·eviction](issues/2026-09-13-priority-class-resource-protection.md) | 보류 |
| **2027-01-15** | Sysbox 지원 문서에 K8s 1.36이 있는지 확인. 없으면 Sysbox 폐기 후 다른 런타임으로 이전 (1.35 maintenance 2026-12-28, EOL 2027-02-28) | [Kubernetes 1.36 업그레이드](issues/2026-10-13-kubernetes-1-36-upgrade.md) | 보류 |

10-25는 CA도 거의 동시에 돈다. Reloader는 Vault STS만 롤하므로 VSO `vault-ca-secret` 옛 CA 문제는 **범위 밖 후속** (Vault TLS 이슈 본문). 12월 PriorityClass는 11월 VPA 주기 결과를 함께 본다. Longhorn 1.13 엔진 업그레이드는 **완료** ([resolved](resolved/2026-10-07-longhorn-1-13-0-upgrade.md)) — K8s Phase 1 일정과 겹침 제약 없음.

---

## 날짜 없음 (트리거 대기)

| 트리거 | 할 일 | 이슈 | 상태 |
|---|---|---|---|
| [envoyproxy/envoy#45198](https://github.com/envoyproxy/envoy/pull/45198) 머지 + 사용 중 Istio `proxyv2` 포함, [istio/istio#60074](https://github.com/istio/istio/issues/60074) 클로즈 | Jellyfin을 ambient로 되돌린 뒤 Direct Play 시크 스트레스. sidecar injection만 제거하고 PeerAuthentication / AuthorizationPolicy는 유지 | [Jellyfin ambient Direct Play](issues/2026-08-17-jellyfin-ambient-mesh-direct-play-seek.md) | 완화 |
| 대상 Windows PC 준비 (원격 데스크톱·NLA·방화벽·내부 IP, 클러스터→`:3389` 도달) | 구현 플랜 Task 1부터 착수 (`docs/superpowers/plans/2026-10-16-warpgate-authentik-rdp.md`) | [Warpgate Authentik RDP](issues/2026-10-16-warpgate-authentik-rdp.md) | 보류 |
---

## 갱신

이슈 상태가 바뀌거나 날짜가 확정되면 이 파일과 해당 이슈를 같이 고친다. 아카이브된 항목은 여기서 지운다.
