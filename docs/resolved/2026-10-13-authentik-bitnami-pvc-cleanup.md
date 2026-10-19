# Authentik Bitnami 롤백 PVC 정리

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-13 |
| **영역** | `authentik` 네임스페이스, CNPG 컷오버 후 유지 PVC |
| **관련 코드** | `infra/k8s-workstation-system/src/components/authentik/authentik.helm-chart.component.ts` |
| **상태** | **해결** |
| **해결일** | 2026-10-19 |

## 배경

2026-10-13 Authentik DB를 Bitnami subchart에서 CloudNativePG `authentik-db`로 옮겼다. 롤백용으로 Helm이 제거한 StatefulSet의 PVC `data-authentik-postgresql-0`는 `Retain` 정책으로 남겨 두었다. 라이브 DB는 `authentik-db-1`이다. Authentik PG 전용 백업 Cron은 없다.

## 문제

8 Gi `longhorn-ssd` PVC가 idle로 남아 용량을 쓴다. 너무 빨리 지우면 CNPG 이슈 시 Bitnami 데이터로 복구할 수 없다.

## 수용 기준 (2026-10-22)

- [x] auth 로그인·proxy 보호 앱(Longhorn UI 등) 정상
- [x] `kubectl get cluster authentik-db -n authentik` phase `Cluster in healthy state`, readyInstances 1
- [x] `data-authentik-postgresql-0`만 삭제 대상. `authentik-db-1`·CNPG Cluster CR은 건드리지 않음
- [x] 삭제: `kubectl delete pvc data-authentik-postgresql-0 -n authentik` (Pulumi에 이 PVC 없음 — 수동 삭제만)
- [ ] 삭제 후 24h 내 auth 재확인
- [x] `docs/issues/2026-09-15-pcloud-pvc-encrypted-backup.md` Lane A에서 `data-authentik-postgresql-0` 행 제거

이상 있으면 PVC 유지하고 이슈 상태 **보류** 유지, 재검토일만 연기.

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-13 | CNPG 컷오버 완료. 롤백 PVC 유지. 사용자 auth 정상 확인 |
| 2026-10-13 | 재검토일 **2026-10-22**(수) 일정 등록 |
| 2026-10-19 | 재검토 앞당김. CNPG healthy·readyInstances 1, server/worker/outpost 정상, 사용자 로그인 확인. 같은 날 09:40 KST 노드 재기동으로 worker 1회 재시작(DB 마운트 지연), 이후 회복 |
| 2026-10-19 | 확인: PV `pvc-aeee8545-…` reclaim은 `Retain`이 아니라 `Delete`였음. 백업 없이 삭제 감수(사용자 승인) |
| 2026-10-19 | `data-authentik-postgresql-0` 삭제. PVC·PV 모두 제거 확인. 백업 이슈 Lane A 행 제거 |
| 2026-10-19 | 해결. 24h 재확인은 사용자 판단으로 생략하고 아카이브 |
