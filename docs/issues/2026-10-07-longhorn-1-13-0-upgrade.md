# Longhorn 1.12.1 → 1.13.0 업그레이드 (사전 조사)

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-07 |
| **영역** | Longhorn (`longhorn` NS), 단일 노드 `workstation-0`, K8s v1.35.4, CNI Cilium |
| **관련 코드** | `infra/k8s-workstation-system/src/contract.ts` (Longhorn 차트 버전), `.../components/longhorn/longhorn.helm-chart.component.ts` |
| **예정일** | **2026-10-13 (월)** — 차트 bump·배포·점검 |
| **상태** | **보류** — **2026-10-11~12 (주말)** 사용자 하드 백업(Jellyfin 2Ti 등). 월요일 전까지 차트 bump·배포 없음 |

## 배경

Nova 진단(`docs/diagnosis/nova.diagnosis.md`)에서 longhorn 차트 1.12.1 → 1.13.0이 올라온다. 다른 차트(Coder·VSO·VM·Tempo·OTel Operator 등)는 순차 반영을 마쳤고 Longhorn만 남았다. 스토리지라 충돌·안전망을 먼저 정리한다.

## 현재 상태 (2026-10-07 실측)

| 항목 | 값 |
|---|---|
| 볼륨 | 17개, 전부 V1 data engine, `replicas=1`, 전부 attached/healthy |
| `v2-data-engine` | `false` |
| 엔진 이미지 | 볼륨 17개 전부 `longhorn-engine:v1.12.0` (`ei-a4d05f02`, refcount 54). v1.12.1 엔진(`ei-493e04e7`)은 refcount 0 |
| 엔진 자동 업그레이드 | `concurrent-automatic-engine-upgrade-per-node-limit=0` (꺼짐) |
| 백업 타깃 | `default`, URL 비어 있음, `AVAILABLE=false` → Longhorn 백업 없음 |
| RecurringJob / BackupVolume | 없음 |
| NetworkPolicy | 1.12.1부터 6개 적용, Cilium이 강제. `longhorn-manager` NP에 스크랩 허용 소스 없음 |
| IM CPU request | 1848m (`guaranteed-instance-manager-cpu` v1/v2 = 12%) |
| 노드 requests | CPU 69%, 메모리 61% |
| longhorn NS | Istio ambient 라벨 없음 (mesh 밖) |

## 문제

### 1. 안전망 없음 (선행 조건)

모든 볼륨이 replica 1개이고 Longhorn 백업이 없다. 엔진·IM 문제 시 복구 수단이 없다. 최대 볼륨은 2 TiB / 1 TiB급. 오프사이트 백업 이슈는 [PVC pCloud 암호화 백업](2026-09-15-pcloud-pvc-encrypted-backup.md).

→ **사용자가 하드 백업을 직접 수행한 뒤** 진행한다. Jellyfin media(약 2 Ti) 등 대용량 PVC는 주말에 시간이 걸릴 수 있다.

### 2. 릴리스 노트 breaking 대조

| 항목 | 이 클러스터 | 판정 |
|---|---|---|
| K8s ≥ 1.34 (csi-provisioner v6.3.0) | v1.35.4 | OK |
| V2 live upgrade는 v1.12.2 이상에서만 | V2 미사용 | 해당 없음 |
| 레거시 V2 linked-clone 제한 | V2 미사용 | 해당 없음 |
| IM gRPC mTLS 전면 적용 | `longhorn-grpc-tls` 시크릿 없음 | 해당 없음 |
| CPU isolation 기본 true | 업그레이드 시 기존값 유지 (`{"v2":"false"}`) | 영향 없음 |
| `longhorn-global-manager` 3 replicas | 단일 노드에 3개 | 주의 (아래) |

### 3. 실제로 걸릴 만한 항목

| 항목 | 내용 | 대응 |
|---|---|---|
| global-manager 3 replicas | 차트 기본 anti-affinity가 `preferred`라 같은 노드에 3개 뜸. standby 2개는 단일 노드에서 의미 없음 | `longhornGlobalManager.replicas: 1` |
| NetworkPolicy ↔ 스크랩 | OTel Collector `longhorn-manager` 잡이 9500에서 이미 막혔을 가능성. VM `up{job="longhorn-manager"}` 미확인 | 1.13.0 `networkPolicies.metricsScrapeSources`로 `monitoring` NS Collector Pod만 허용 (namespaceSelector + podSelector 한 항목) |
| 엔진 v1.12.0 잔존 | 1.13.0에서도 구버전 엔진 동작 여부는 노트에서 직접 확인 못 함. 마이너 한 단계 이내 | Helm 먼저, 안정화 후 엔진 별도 업그레이드 |
| 엔진 업그레이드 시 IM 이중 상주 | 새 IM(1.13.0) + 옛 IM(1.12.1) 동시 존재 → IM request 약 +1.8코어. replica 1 볼륨은 I/O 일시 중단 가능 | 조용한 시간대, 큰 볼륨 스냅샷·정합성 검사와 겹치지 않게 |
| CSI 사이드카 교체 | provisioner v5.3.0 → v6.3.0 롤링 중 attach·PVC 생성 지연 가능. 현재도 CSI Pod 재시작 횟수 높음 (리더 선출 노이즈로 추정) | 배포 후 PVC 생성·attach 점검 |
| 새 SA | `longhorn-csi-service-account`. 기본값으로 Secret get 유지 | 동작 영향 없음 |
| manager 롤링 | 단일 노드라 admission webhook 약 1~2분 단절 가능 | 그 사이 CRD 변경 작업 금지 |
| Helm `waitForJobs: true` | pre-upgrade Job 실패 시 릴리스 실패 | 실패 시 pre-upgrade Job 로그 우선 |

### 배제·무관

| 항목 | 이유 |
|---|---|
| Istio ambient 영향 | longhorn NS는 mesh 밖. UI만 VirtualService 경유 |
| StorageClass 변경 | `createStorageClass: false`, Helm이 만들지 않음 |
| IaC values 키 | `defaultSettings`·`longhornManager.resources`·`persistence`는 1.13.0에서도 동일 |

## 추천 순서

1. 사용자 하드 백업 (중요 PVC 우선: Vault, Postgres 등)
2. IaC: Longhorn 차트 1.13.0, `longhornGlobalManager.replicas: 1`, (선택) `metricsScrapeSources`
3. 배포 후 점검: manager / global-manager / CSI / IM, 볼륨 healthy, `up{job="longhorn-manager"}`
4. 별도 일정: 볼륨 엔진을 v1.13.0으로 업그레이드 (live upgrade)

## 수용 기준

- [ ] 하드 백업 완료 확인 (사용자)
- [ ] Longhorn 차트 1.13.0 반영, global-manager 1 replica
- [ ] 배포 후 17개 볼륨 attached/healthy 유지, CSI 정상
- [ ] longhorn-manager 메트릭 스크랩 정상 (또는 NP 허용 규칙 반영)
- [ ] 엔진 업그레이드는 별도 단계로 결정

## 범위 밖

- Longhorn 백업 타깃·정기 백업 구성 (pCloud 백업 이슈에서 다룸)
- V2 data engine 도입
- replica 수 증설 (단일 노드라 의미 없음)

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-07 | 등록. 릴리스 노트·차트 diff·클러스터 실측 조사. 사용자 하드 백업 선행 후 진행하기로 보류 |
| 2026-10-07 | 일정 확정: 주말(10-11~12) 하드 백업(사용자), **10-13(월)** Longhorn 1.13.0 업그레이드 진행 |
