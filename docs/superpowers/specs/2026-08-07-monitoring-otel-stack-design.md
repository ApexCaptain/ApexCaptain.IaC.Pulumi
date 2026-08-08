# OpenTelemetry Operator 기반 통합 모니터링 스택

**프로젝트:** `infra/k8s-workstation-system`  
**날짜:** 2026-08-07  
**상태:** 설계 승인 완료 (2026-08-07)

## 1. 목표

`monitoring` 네임스페이스에 OpenTelemetry Operator 중심의 통합 관측 스택을 Pulumi TypeScript `ComponentResource`로 구축한다.

- 메트릭: VictoriaMetrics
- 로그: Grafana Loki
- 트레이스: Grafana Tempo
- UI: Grafana (외부 노출 유일한 진입점)
- 수집: OpenTelemetryCollector (DaemonSet) + Instrumentation (central)

기존 컴포넌트 패턴(`defineComponent`, Helm Release, Istio VirtualService, Authentik OIDC)을 따른다.

## 2. 결정 사항 요약

| 항목 | 결정 |
|---|---|
| 스토리지 | Longhorn PVC (`longhorn-ssd`) |
| 외부 노출 | Grafana만 (`cloudflare` `grafana` CNAME → Istio VS) |
| Grafana 인증 | Authentik OIDC (Argo 패턴). Proxy/ext-authz 미사용 |
| 최소 접근 그룹 | `systemUserGroup` (하위 `systemManager` 포함) |
| Grafana 역할 | `System User` → Viewer, `System Manager` → Admin |
| 컴포넌트 구조 | 관심사별 분리 (Longhorn/Argo와 동일) |
| Admin 비밀 | DevContainer/`GRAFANA_ADMIN_PASSWORD` → project ESC (평문, bcrypt 불필요) |
| 객체 스토리지 | 사용 안 함 (MinIO/S3 제외). 추후 필요 시 마이그레이션 |

## 3. 아키텍처

### 3.1 컴포넌트 경계

경로: `infra/k8s-workstation-system/src/components/monitoring/`

| 컴포넌트 | 역할 |
|---|---|
| `otel-operator.helm-chart` | `monitoring` Namespace + OpenTelemetry Operator Helm (`open-telemetry/opentelemetry-operator`), cert-manager webhook 연동 |
| `victoria-metrics.helm-chart` | VictoriaMetrics single + Longhorn PVC |
| `loki.helm-chart` | Loki (SingleBinary 계열) + filesystem/PVC |
| `tempo.helm-chart` | Tempo single-binary/local + PVC |
| `grafana.helm-chart` | Grafana + VM/Loki/Tempo datasource 사전 등록, Ingress 비활성(ClusterIP) |
| `otel.resources` | `OpenTelemetryCollector` CR (`mode: daemonset`) + `Instrumentation` CR (`central-instrumentation`) |
| `grafana.authentik` | OIDC Provider/Application, `systemUserGroup` PolicyBinding, groups claim |
| `grafana.service-mesh` | Istio VirtualService → Grafana (`records.grafana`) |

`index.ts`에서 위 컴포넌트를 re-export. `contract.ts`에서 의존 순서에 맞게 인스턴스화.

### 3.2 배포 의존 순서

```
cert-manager (기존)
  → otel-operator
  → (victoria-metrics ∥ loki ∥ tempo)   # Longhorn longhorn-ssd 필요
  → grafana.authentik                   # OIDC client를 Grafana values에 주입
  → grafana.helm-chart
  → otel.resources                      # Operator CRD + 백엔드 Service 필요
  → grafana.service-mesh
```

단방향 흐름: Authentik OIDC output/secret → Grafana Helm values. Grafana를 두 번 올리는 2단계 패치는 하지 않는다.

### 3.3 데이터플로우

```
App Pods (Instrumentation annotation)
  └─ OTLP ──► OpenTelemetryCollector (DaemonSet, monitoring)
                 ├─ metrics → VictoriaMetrics
                 ├─ logs    → Loki
                 └─ traces  → Tempo

Grafana datasources ← VictoriaMetrics / Loki / Tempo (클러스터 내부 DNS)

Browser → https://grafana.<zone> → Istio Gateway/VS → Grafana
         └─ OIDC ──► Authentik
```

백엔드·Operator·Collector는 ClusterIP/내부 전용. Cloudflare DNS는 Grafana만 사용한다 (`records.workstation`에 이미 `grafana` 레코드·FQDN output 존재).

## 4. 수집 계층 상세

### 4.1 OpenTelemetryCollector

- API: Operator CRD `OpenTelemetryCollector`
- `mode: daemonset`, namespace `monitoring`
- Receivers (1차): OTLP (gRPC/HTTP), `filelog`(파드/컨테이너 로그), `kubeletstats`(노드/파드 메트릭). `k8s_cluster`는 필요 시 후속
- Processors: `memory_limiter`, `batch`, `k8sattributes`, `resource`
- Exporters: VictoriaMetrics(remote write 또는 OTLP), Loki(OTLP), Tempo(OTLP) — in-cluster Service DNS
- 클러스터 전역 수집; 앱 텔레메트리는 Instrumentation 또는 직접 OTLP로 Collector에 연결

### 4.2 Instrumentation

- 이름: `central-instrumentation`, namespace `monitoring`
- 타 네임스페이스 Pod annotation 예시:  
  `instrumentation.opentelemetry.io/inject-sdk: monitoring/central-instrumentation`
- exporter endpoint: 중앙 Collector OTLP
- 언어별 sampler는 기본값; 세부 튜닝은 후속 작업

CR 정의는 `@pulumi/kubernetes` CustomResource 또는 `common/custom-resources`에 OTel CRD 래퍼가 있으면 그것을 사용한다. 없으면 구현 시 CustomResource로 두고, 필요하면 이후 CRD 래퍼로 승격한다.

## 5. 스토리지 · Helm

### 5.1 Persistence

| 구성 요소 | 모드 | StorageClass | 보존(기본) |
|---|---|---|---|
| VictoriaMetrics | single | `longhorn-ssd` | 15d |
| Loki | SingleBinary + filesystem/PVC | `longhorn-ssd` | 7d |
| Tempo | single / local PVC | `longhorn-ssd` | 3d |

보존 기간은 ESC 또는 컴포넌트 args로 조정 가능하게 두되, 1차 구현은 위 기본값을 하드코딩해도 된다.

### 5.2 ESC / 환경변수

**common ESC (`helmRepositoryUrls`)**에 추가:

- OpenTelemetry Operator chart repo (`open-telemetry.github.io/opentelemetry-helm-charts` 등 공식 URL)
- VictoriaMetrics charts
- Grafana charts (grafana / loki / tempo)

**project ESC (`k8s-workstation-system`)**에 추가:

```ts
grafana: {
  adminPassword: z.string(),
}
```

DevContainer 환경변수:

```bash
GRAFANA_ADMIN_PASSWORD=<uuid-v7 plaintext>
```

`.projenrc.ts` upsert에서 `process.env.GRAFANA_ADMIN_PASSWORD` 매핑.  
Grafana username은 기본 `admin`. Argo와 달리 bcrypt 사전 해시는 불필요하다.

### 5.3 Operator / Grafana Helm 요점

- OTel Operator: `admissionWebhooks.certManager.enabled=true` (기존 cert-manager 재사용)
- Grafana: Ingress/기본 Ingress 비활성, Service ClusterIP
- Datasources (Grafana provisioning YAML / Helm `datasources`):
  - VictoriaMetrics → Prometheus 타입
  - Loki → Loki 타입
  - Tempo → Tempo 타입
  - 가능하면 Tempo↔Loki derivedFields(트레이스-로그 상관) 기본 연결

## 6. Grafana 인증 · Mesh

### 6.1 `grafana.authentik` (Argo OIDC 패턴)

- Application slug: `grafana`
- OAuth2 redirect: `https://<grafana-host>/login/generic_oauth`
- PolicyBinding: `systemUserGroup`
- groups scope/claim (예: `grafana_groups`)으로 Grafana role mapping:
  - group name `System User` → Viewer
  - group name `System Manager` → Admin
- output: issuerUrl, groupsClaim, scopes
- secret: clientId, clientSecret → Grafana Helm `grafana.ini` / `auth.generic_oauth`

로컬 admin(`GRAFANA_ADMIN_PASSWORD`)은 비상(break-glass)용. 일상 로그인은 OIDC.

### 6.2 `grafana.service-mesh`

- Istio `VirtualService`만 (Argo와 동일)
- host: `cloudflareContract.output.zones.ayteneve93com.records.grafana`
- gateway: 기존 istio ingress gateway path
- Authentik Proxy + AuthorizationPolicy(ext-authz)는 **사용하지 않음**

## 7. contract.ts 배선 (개요)

1. ESC에서 helm 버전/repo, `grafana.adminPassword`, Longhorn `storageClasses.longhornSsd` 참조
2. `OtelOperatorHelmChart` (dependsOn: cert-manager)
3. VM / Loki / Tempo Helm (dependsOn: operator NS + Longhorn SC; 상호 병렬 가능)
4. `GrafanaAuthentik` (dependsOn: authentik resources)
5. `GrafanaHelmChart` (datasources + OIDC values/secret, adminPassword)
6. `OtelResources` (dependsOn: operator + backends)
7. `GrafanaServiceMesh` (dependsOn: grafana helm + istio gateway)

`components/index.ts`에 monitoring export 추가.

## 8. 범위 밖 (YAGNI)

- MinIO / 외부 S3
- VictoriaMetrics 클러스터 모드 / 다중 레플리카 HA
- Grafana 외 백엔드 외부 노출
- Authentik Proxy 앞단 SSO (OIDC로 대체)
- 언어별 sampler·대시보드 대규모 번들 (필요 시 후속)
- Cloudflare DNS 레코드 신규 생성 (이미 존재)

## 9. 성공 기준

- `monitoring` NS에 Operator, VM, Loki, Tempo, Grafana, Collector DaemonSet, central Instrumentation이 기동
- Grafana UI가 `https://grafana.<zone>`에서 열리고 Authentik OIDC 로그인 가능
- `System User`는 Viewer, `System Manager`는 Admin
- 타 NS Pod에 Instrumentation annotation으로 트레이스/메트릭/로그가 각 백엔드에 적재되고 Grafana datasource로 조회 가능
- VM/Loki/Tempo는 클러스터 외부에서 직접 노출되지 않음

## 10. 구현 시 참고 패턴

- Helm + NS: `cert-manager.helm-chart.component.ts`, `longhorn.helm-chart.component.ts`
- OIDC: `argo.authentik.component.ts` + `argo.cd.component.ts` RBAC/OIDC values
- VirtualService only: `argo.service-mesh.component.ts`
- StorageClass 참조: `longhorn.resources` output → 타 Helm persistence
- ESC env 매핑: `.projenrc.ts` `k8sWorkstationSystemEsc.upsertEsc`의 `argoCd` / `authentik` 블록
