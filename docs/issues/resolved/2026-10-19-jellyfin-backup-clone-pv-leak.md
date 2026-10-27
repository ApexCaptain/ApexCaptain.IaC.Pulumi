# Jellyfin DR 백업 clone PV가 매 실행마다 Released로 남음

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-19 |
| **영역** | `jellyfin` 네임스페이스, Longhorn, PvcSnapshotArchiveV1 |
| **관련 코드** | `infra/k8s-workstation-apps/src/contract.ts` (jellyfinBackup dr target), `common/custom-resources/templates/pvc-snapshot-archive.v1/run.sh`, `common/custom-resources/src/components/backup/pvc-snapshot-archive.v1.component.ts` |
| **상태** | **해결** |
| **해결일** | 2026-10-19 |

## 증상

2026-10-19 클러스터 점검에서 `jellyfin/jellyfin-backup-dr-*-clone`을 claim으로 가진 PV 7개가 `Released`·`Retain` 상태로 남아 있었다. 각 5 Gi, 합 35 Gi (`longhorn-ssd-retain`). Longhorn 볼륨은 `detached`, robustness `unknown`. 생성 시점이 22h~4d22h로 일일 Cron(12:00 KST)마다 1개씩 쌓인다.

qbittorrent·vikunja 백업은 원본 PVC가 Delete 클래스라 남지 않는다.

## 원인

`run.sh`의 `resolve_clone_spec`은 `CLONE_STORAGE_CLASS`가 비면 원본 PVC의 storageClass를 상속한다. `jellyfin-config`는 `longhorn-ssd-retain`이므로 clone도 Retain으로 생긴다. `cleanup()`이 clone PVC를 지워도 PV·Longhorn 볼륨은 reclaim `Retain` 때문에 남는다.

## 조치

- `infra/k8s-workstation-apps/src/contract.ts` — jellyfin dr target에 `clone.storageClassName: longhornSsd` 지정 (기존 override API 사용)
- `PvcSnapshotArchiveTargetShape.clone` JSDoc에 "원본이 Retain이면 Delete 클래스 지정" 경고 추가
- template 상속 로직은 그대로 둠. Retain 감지는 StorageClass·PV 조회(cluster RBAC)가 필요해 범위 밖

검증: `k8s-workstation-apps`·`custom-resources` compile 통과, custom-resources test 28/28 통과. preview `~ 3 to update` (jellyfin-backup 컴포넌트 2 + CronJob `jellyfin-backup-dr-config` env `CLONE_STORAGE_CLASS`), 63 unchanged.

## 고아 PV 정리 (사용자 실행)

에이전트 실행은 권한 정책에 막혔다. reclaim을 `Delete`로 바꾸면 external-provisioner가 PV와 Longhorn 볼륨을 같이 지운다. PV 객체만 지우면 Longhorn 볼륨은 남는다.

```bash
for pv in pvc-49fc88aa-44f1-4f4d-b01e-3215078356a0 pvc-65ac708d-23d8-4b97-a69c-5c0b562ce452 \
  pvc-98d40781-71d7-4e15-bb43-b5929e4192f8 pvc-a21c3295-1c7c-4b32-9aae-c17f04caa98b \
  pvc-ac1d3b65-b047-457b-b2cc-a5bf26868f3f pvc-ad34fdf5-a4b2-4190-95ca-7540177c4f7b \
  pvc-eef877af-220b-4ebc-8eca-19ecfe30c5fb; do
  kubectl patch pv "$pv" -p '{"spec":{"persistentVolumeReclaimPolicy":"Delete"}}'
done
```

`jellyfin-config`(`pvc-ccea9365-…`)·`jellyfin-media`는 Bound Retain이며 대상 아님. up 전에 다음 12:00 Cron이 돌면 1개 더 생기므로 정리 전에 `kubectl get pv | grep Released`로 다시 목록을 본다.

## 수용 기준

- [x] `k8s-workstation-apps/prod` up (CronJob env `CLONE_STORAGE_CLASS=longhorn-ssd`)
- [x] 기존 Released clone PV·Longhorn 볼륨 전부 제거
- [x] up 후 첫 12:00 KST 백업 성공 (Slack INFO) + Released PV 신규 0개
- [x] clone 복원 경로 영향 없음: 백업 산출물 형식은 storageClass와 무관 (tar.zst)

## 범위 밖

- template에서 Retain 클래스를 자동 감지·차단 (cluster RBAC 필요). 다른 Retain 원본 타깃이 생기면 별도 이슈

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-19 | 등록. 클러스터 점검에서 Released clone PV 7개(35 Gi) 발견. 원인: Retain StorageClass 상속 |
| 2026-10-19 | contract에 clone `longhorn-ssd` override, JSDoc 경고. compile·test·preview 통과. 고아 PV 정리는 권한 정책으로 사용자 실행 대기 |
| 2026-10-19 | 사용자가 reclaim `Delete` patch 실행. Released PV 0개, Longhorn detached 볼륨 0개 확인. `jellyfin-config`·`jellyfin-media` Bound 유지. CronJob env는 아직 빈 값 (up 전) |
| 2026-10-19 | 사용자 `k8s-workstation-apps/prod` up. CronJob env `CLONE_STORAGE_CLASS=longhorn-ssd`(reclaim Delete) 반영 확인 |
| 2026-10-19 | 12:00 KST Job `jellyfin-backup-dr-config-29872980` 성공 (`clone storageClass override=longhorn-ssd`, pCloud `…/jellyfin-config/2026-10-19_120013`, cleanup exit=0). Slack 성공 수신(사용자). Released PV·detached 볼륨 0개. 해결 |
