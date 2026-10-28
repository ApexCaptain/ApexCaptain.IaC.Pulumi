# 상태 보존 리소스에 Pulumi `protect`가 없음 — 실수 한 번에 데이터 유실

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-17 |
| **우선순위** | 높음 |
| **영역** | `infra/k8s-workstation-system`, `infra/k8s-workstation-apps`, `infra/k8s-workstation-tools`, `common/custom-resources` |
| **관련 코드** | `infra/k8s-workstation-apps/src/components/jellyfin/jellyfin.helm-chart.component.ts`, `infra/k8s-workstation-tools/src/components/qbittorrent/qbittorrent.app.component.ts`, `infra/k8s-workstation-tools/src/components/coder/coder.base.component.ts`, `infra/k8s-workstation-tools/src/components/vikunja/vikunja.base.component.ts`, `infra/k8s-workstation-system/src/components/authentik/authentik.helm-chart.component.ts`, `infra/k8s-workstation-system/src/components/vault/vault.helm-chart.component.ts` |
| **관련 문서** | [구현 플랜](../../superpowers/plans/2026-10-17-stateful-resource-protect.md) |
| **상태** | **해결** — 3개 스택 protect·retainOnDelete 반영, 후속(SC 이전·policy pack)은 범위 밖 |
| **해결일** | 2026-10-17 |

## 현재

- **적용 요약 (17개):** `k8s-workstation-system` 5 (vault NS·Release, authentik NS·CNPG, monitoring NS만), `k8s-workstation-apps` 3 (jellyfin NS·config/media PVC), `k8s-workstation-tools` 9 (qbittorrent NS·config/complete PVC, coder NS·sysbox-ubuntu NS·CNPG, vikunja NS·CNPG·Helm Release).
- **D1:** monitoring은 Namespace만 보호. Grafana·Loki·Tempo·VictoriaMetrics 데이터는 백업 없음·재생성 허용. StorageClass Retain 이전 없음.

### 의도적 replace 절차

```bash
# 1. 대상 URN 확인
pulumi stack export --stack prod | jq -r '.deployment.resources[] | select(.protect==true) | .urn'
# 2. 보호 해제 (state만 바뀜)
pulumi state unprotect --stack prod '<URN>'
# 3. 코드에서 해당 리소스의 statefulResourceOptions 제거 후 preview로 replace 내용 확인
# 4. 백업 최신 여부 확인 (pCloud dr lane) 후 up
# 5. 코드에 statefulResourceOptions를 되돌리고 up (재보호)
```

`retainOnDelete` 때문에 replace 후 이전 리소스가 클러스터에 남을 수 있다. 같은 `metadata.name`이면 create가 충돌한다. 그때는 이전 리소스를 kubectl로 직접 정리한다 (PVC면 데이터 이전 완료 확인 후).

## 배경

레포 전체에서 `protect`/`retainOnDelete`는 github 스택 2곳뿐이다 (`ApexCaptain.IaC.Pulumi.repository.component.ts`, `ApexCaptain.IaC.GitOps.repository.component.ts`). 클러스터 쪽 상태 보존 리소스(PVC, CNPG `Cluster`, 그 PVC를 품은 Namespace, StatefulSet을 만드는 Helm release)에는 하나도 없다.

`longhorn-ssd`·`longhorn-hdd` StorageClass의 reclaimPolicy는 `Delete`다. PVC 오브젝트가 지워지면 Longhorn 볼륨도 같이 사라진다.

## 문제

다음 중 하나만 일어나도 Pulumi가 delete/replace를 실행하고 데이터가 지워진다.

- 리팩터 중 리소스 이름·부모를 바꾸고 `aliases`를 빠뜨림 (delete + create)
- replace를 유발하는 필드 변경 (PVC `storageClassName`, `metadata.name` 등)
- 컴포넌트 삭제·`pulumi destroy` 실수
- Namespace replace — 안의 PVC가 cascade 삭제

`pulumi:up`은 `preview --expect-no-changes` 뒤 바로 up하므로 diff를 사람이 놓치면 막을 장치가 없다.

## 실측 (2026-10-17, live cluster)

| PVC | NS | SC (reclaim) | Pulumi 관리 방식 | 백업 |
|---|---|---|---|---|
| `data-vault-0` | vault | local-path (Retain) | Helm STS volumeClaimTemplate | Raft snapshot, pCloud |
| `authentik-db-1` | authentik | longhorn-ssd (**Delete**) | CNPG `ClusterV1` | pg_dump |
| `data-authentik-postgresql-0` | authentik | longhorn-ssd (**Delete**) | Bitnami 잔재, 롤백 보관 | pg_dump |
| `coder-postgresql-cluster-1` | coder | longhorn-ssd (**Delete**) | CNPG `ClusterV1` | pg_dump |
| `vikunja-postgresql-cluster-1` | vikunja | longhorn-ssd (**Delete**) | CNPG `ClusterV1` | pg_dump |
| `vikunja-data` | vikunja | longhorn-ssd (**Delete**) | Helm | tar |
| `jellyfin-config` | jellyfin | longhorn-ssd-retain (Retain) | `kubernetes.core.v1.PersistentVolumeClaim` | tar |
| `jellyfin-media` (2Ti) | jellyfin | longhorn-hdd-retain (Retain) | 직접 PVC | 없음 (media lane) |
| `jellyfin-cache` | jellyfin | longhorn-ssd (Delete) | 직접 PVC | 불필요 |
| `qbittorrent-config` | qbittorrent | longhorn-ssd (**Delete**) | 직접 PVC | tar |
| `qbittorrent-complete-downloads` (1Ti) | qbittorrent | longhorn-hdd (**Delete**) | 직접 PVC | 없음 |
| `qbittorrent-incomplete-downloads` | qbittorrent | longhorn-ssd (Delete) | 직접 PVC | 불필요 |
| `grafana`, `storage-loki-0`, `storage-tempo-0`, VictoriaMetrics | monitoring | longhorn-ssd (Delete) | Helm | 없음 (재생성 허용 여부 결정 필요) |
| `argo-cd-redis-*` | argo-cd | longhorn-ssd (Delete) | Redis Operator | 불필요 (캐시) |

Coder 워크스페이스 PVC(`coder-sysbox-ubuntu`)는 Coder 템플릿이 관리하므로 이 이슈 범위 밖이다.

## 접근 비교

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| A. `protect: true` | 대상 리소스에 opts 추가 | delete/replace 시 preview 단계에서 실패. 코드 변경만 | 의도한 replace 때 `pulumi state unprotect` 필요 |
| B. `retainOnDelete: true` | state에서만 빠지고 클러스터엔 남음 | 실수 삭제해도 데이터 보존 | replace 시 이름 충돌로 create 실패 가능. 고아 리소스 생김 |
| C. StorageClass Retain 전환 | 중요 PVC를 `*-retain` SC로 | PVC 삭제돼도 PV 남음 | PVC SC 변경은 replace → 데이터 이전 작업 필요 |
| D. CrossGuard policy pack | PVC·CNPG Cluster에 protect 없으면 preview 실패 | 신규 리소스까지 강제 | policy pack 패키지·실행 설정 추가 |

## 추천

A + B를 같이 쓴다 (데이터 계층: PVC, CNPG `Cluster`, 그 Namespace, 상태 저장 Helm release). C는 신규 PVC부터만 적용하고 기존 PVC 이전은 후속. D는 A 적용 후 후속 이슈로 분리.

## 수용 기준

- [x] 위 표에서 백업이 있거나 재생성 불가한 PVC·CNPG `Cluster`·소속 Namespace·Helm release에 `protect: true` + `retainOnDelete: true`
- [x] monitoring PVC 보호 여부 결정과 근거를 이 문서에 기록 (D1, `## 현재`)
- [x] 각 스택 `pulumi preview --stack prod`에서 delete/replace 없음, opts(`protect`·`retainOnDelete`)만 변경
- [x] 의도적 replace 절차 (`pulumi state unprotect` → up → 재protect) 를 이 문서에 기록 (`## 현재`)

## 범위 밖

- 기존 Delete SC PVC를 Retain SC로 이전 (후속)
- CrossGuard policy pack (후속)
- Coder 워크스페이스 PVC

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-17 | 등록. 프로젝트 평가에서 도출, live PVC·SC 실측 |
| 2026-10-17 | 구현 플랜 작성. 대상 17개(system 5 / apps 3 / tools 9) 확정. monitoring은 Namespace만 보호(D1 기본값) |
| 2026-10-17 | D1 사용자 확정 (SC Retain 이전 안 함). 플랜 검증: 대상 17곳 코드 위치·opts 형태 일치, 로컬 backend 실측으로 opts만 바뀌면 `--expect-no-changes`가 exit 0 통과(=`pnpm pulumi:up` 사용 불가), protect된 리소스 replace preview는 exit 1 확인 |
| 2026-10-17 | protect·retainOnDelete 적용 (system 5, apps 3, tools 9). preview delete/replace 0, state 검증 일치 |
| 2026-10-17 | 사후 점검: build·test·eslint exit 0, 3개 스택 `preview --expect-no-changes` exit 0, state protect 대상 17개 일치, jellyfin NS replace preview 거부 확인. 해결 처리, `docs/resolved`로 이동 |
