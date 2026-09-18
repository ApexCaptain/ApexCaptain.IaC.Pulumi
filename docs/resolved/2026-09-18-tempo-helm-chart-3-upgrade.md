# Tempo Helm Chart 2.3.0 → 3.0.0 업그레이드

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-18 |
| **해결일** | 2026-09-18 |
| **영역** | `k8s-workstation-system` / `monitoring` / Tempo |
| **관련 코드** | `infra/k8s-workstation-system/src/components/monitoring/tempo.helm-chart.component.ts`, `contract.ts` |
| **상태** | **해결** — prod chart 3.0.0·app 3.0.3·리소스 반영, 롤아웃·스모크 확인 완료 |

## 해결 요약

Grafana Community `tempo` 차트 **3.0.0** (monolithic, local PVC 72h)로 IaC·`pulumi up` 적용. `tempo.resources`에 requests 512Mi / limits 2Gi 반영. 클러스터 `tempo-0` Ready·restart 0. 7일 관찰 일정은 사용자 확인으로 이슈 종료; **72h retention 디스크**는 일상 모니터링으로 이관.

## 배경

Nova diagnosis(`docs/diagnosis/nova.diagnosis.md`)에서 `monitoring/tempo` 릴리스가 chart **2.3.0** (app **2.10.8**), 최신 chart **3.0.0** (app **3.0.3**)로 표시됨. 현재 배포는 **Grafana Community `tempo` 차트(단일 바이너리 monolithic)**, 로컬 PVC(`storage.trace.backend: local`, `/var/tempo/traces`), retention **72h**, metrics generator **비활성**.

연동: OTel Collector `otlp/traces` → Tempo OTLP gRPC **4317**; Grafana datasource HTTP **3200**; 서비스명 `tempo` (Helm release name과 동일).

## 문제

메이저 차트·앱 버전 점프(2.x → 3.0)로 설정 스키마·내부 아키텍처(ingester/compactor 제거, live-store·backend-scheduler/worker)가 바뀜. 무계획 `helm upgrade` 시 기동 실패·메모리 OOM·블록 포맷 불일치·다운그레이드 불가 상태로 갈 수 있음.

## 현재 IaC 요약

| 항목 | 값 |
|---|---|
| Chart | `grafana-community/tempo` **3.0.0** |
| 모드 | Monolithic (Kafka 불필요) |
| 스토리지 | Longhorn PVC 10Gi, local backend |
| Retention | 72h (`tempo.retention`) |
| 리소스 | requests 100m/512Mi, limits 1 CPU / 2Gi memory (`tempo.resources`) |
| Metrics generator | off |

## 위험·주의 (우선순위)

| # | 항목 | 영향 | 이 배포 관련도 |
|---|---|---|---|
| 1 | **vParquet4 미만 블록** | Tempo 3.0은 vParquet3 이하 미지원 → 기동/쿼리 실패 | 2.10.8은 보통 vParquet4+ 기본이나 **PVC 실측 필수** |
| 2 | **다운그레이드 없음** | 3.0 적용·데이터 경로 전환 후 chart 2.x 롤백 어려움 | PVC 백업·스냅샷 권장 (`storage-tempo-0`, 이슈 [pCloud 백업](../issues/2026-09-15-pcloud-pvc-encrypted-backup.md)) |
| 3 | **메모리** | VPA 추천 target ~1.22Gi | **2Gi limits**로 조정 완료 |
| 4 | **디스크** | 72h retention + 10Gi PVC | compaction 경로 변경 후 사용량은 운영 중 주기 확인 |
| 5 | **설정 스키마** | chart 3.0 스키마 | chart 기본 변환으로 적용 |
| 6 | **metrics generator / local_blocks** | 3.0에서 `local_blocks` 제거 | disabled → 해당 없음 |
| 7 | **포트·DNS** | 3200/4317/4318 | Collector·Grafana 변경 없음 |
| 8 | **TraceQL metrics** | RF1 블록만 | generator 미사용 → 영향 낮음 |
| 9 | **StatefulSet 롤링** | 단기 ingest·query 갭 | 롤아웃 완료 |

**해당 없음 (분산 차트 아님):** `tempo-distributed` 3.0의 Kafka·MinIO subchart 제거·parallel migration 경로.

## 사전 확인 (적용 전 체크리스트)

- [x] Pod/PVC Ready·bound
- [x] 기동 로그에 parquet/legacy overrides 치명 오류 없음 (업그레이드 후)
- [x] 백업 — 사용자 판단으로 생략
- [x] chart 3.0.0 UPGRADE 검토

## 구체적 실행 계획

(역사 기록 — 아래 타임라인에 실제 적용 반영.)

## 수용 기준

- [x] chart **3.0.0**, app **3.0.x** 클러스터 반영
- [x] `tempo-0` Ready, 적용 직후 CrashLoop/OOM 없음 (장기 24h·7일 관찰은 이슈 밖 운영 모니터)
- [x] 배포·롤아웃 후 이상 없음 (사용자 확인)
- [x] IaC memory limits **2Gi** Pod 반영

## 범위 밖

- `tempo-distributed` 전환, Kafka 도입
- metrics generator 활성화·TraceQL metrics GA 활용
- VictoriaMetrics/Loki 차트 업그레이드

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-18 | 등록. chart 3.0.0 UPGRADE·monolithic migration 가이드·현재 IaC 대조 |
| | Nova diagnosis와 일치: 2.3.0 → 3.0.0 대상 확인 |
| 2026-09-18 | `contract.ts` chart **3.0.0**, resources requests 512Mi / limits 2Gi. 백업 생략 |
| 2026-09-18 | `pulumi preview` — 변경 2건(`tempoHelmChart`, helm Release values+version), PVC 삭제 없음 |
| 2026-09-18 | prod `pulumi up`·롤아웃 완료. chart **3.0.0** / app **3.0.3**, ConfigMap 3.0 스키마·retention 72h |
| 2026-09-18 | `tempo.resources`로 limits 이전 후 `pulumi up` — Pod **Burstable**, 512Mi/2Gi |
| 2026-09-18 | 사용자 요청으로 **해결**·`docs/resolved` 아카이브 |
