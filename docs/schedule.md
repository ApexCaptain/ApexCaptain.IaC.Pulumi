# 열린 이슈 일정

`docs/issues/` 기준. 날짜가 있는 확인·재개만 달력에 넣고, 나머지는 트리거 대기.

원문·수용 기준은 각 이슈 문서. 이 표는 언제 무엇을 볼지만.

---

## 달력

| 언제 | 할 일 | 이슈 | 상태 |
|---|---|---|---|
| **2026-10 초** | VPA 추천 재스냅샷 → 갭 재분석. 안전한 항목만 IaC 패치. jellyfin / qbittorrent / coder는 피크 확인 후에만 축소 | [VPA 리소스 재조정](issues/2026-09-08-vpa-resource-rightsizing-followup.md) | 보류 |
| **2026-10 초** | projen `CronScheduleOptions` / 이슈·PR 재검색. 없으면 업스트림 이슈 등록. 타입 생기면 `as any` 제거 여부 결정 | [Projen schedule timezone](issues/2026-09-09-projen-workflow-schedule-timezone.md) | 보류 |
| **2026-10-25 19:03 KST** | leaf 갱신 (`vault-server-certificate` renewalTime 10:03:36Z). Reloader가 vault-0를 롤했는지, 롤 후 `VaultConnection` Healthy·서비스 DNS TLS 유지되는지. 통과하면 `docs/resolved`로 이동 | [Vault TLS cert reload](issues/2026-09-06-vault-tls-cert-reload.md) | 적용 · 실검증 대기 |
| **2026-10-31 이후** | qBit·Jellyfin v3 라이브 확인 후 `SftpV1Component`·테스트·export 삭제. 그 전 삭제 없음 | [SftpV1 삭제](issues/2026-09-10-sftp-v1-removal.md) | 보류 |

같은 날 묶음: 10월 초는 VPA + Projen 두 건을 같이 본다. 10-25는 CA도 거의 동시에 돈다. Reloader는 Vault STS만 롤하므로 VSO `vault-ca-secret` 옛 CA 문제는 **범위 밖 후속** (이슈 본문).

---

## 날짜 없음 (트리거 대기)

| 트리거 | 할 일 | 이슈 | 상태 |
|---|---|---|---|
| [envoyproxy/envoy#45198](https://github.com/envoyproxy/envoy/pull/45198) 머지 + 사용 중 Istio `proxyv2` 포함, [istio/istio#60074](https://github.com/istio/istio/issues/60074) 클로즈 | Jellyfin을 ambient로 되돌린 뒤 Direct Play 시크 스트레스. sidecar injection만 제거하고 PeerAuthentication / AuthorizationPolicy는 유지 | [Jellyfin ambient Direct Play](issues/2026-08-17-jellyfin-ambient-mesh-direct-play-seek.md) | 완화 |
| husky·PR 스크립트 구현 PR 머지 | 1~3단계 수용 기준 확인 후 `docs/resolved`로 이동 | [gitflow 자동화](issues/2026-09-12-gitflow-automation.md) | 진행중 |

---

## 갱신

이슈 상태가 바뀌거나 날짜가 확정되면 이 파일과 해당 이슈를 같이 고친다. 아카이브된 항목은 여기서 지운다.
