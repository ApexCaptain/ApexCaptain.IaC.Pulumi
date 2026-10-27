# OpenTelemetry Operator 기반 통합 모니터링 스택

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-08-07 |
| **해결일** | 2026-09-10 |
| **영역** | `infra/k8s-workstation-system` — `monitoring` 네임스페이스 |
| **관련 코드** | `infra/k8s-workstation-system/src/components/monitoring/`, `infra/k8s-workstation-system/src/contract.ts` |
| **상태** | **해결** |

## 해결 요약

`monitoring` NS에 OTel Operator 중심 관측 스택을 Pulumi `ComponentResource`로 올렸다. 메트릭은 VictoriaMetrics, 로그는 Loki, 트레이스는 Tempo, UI는 Grafana만 외부 노출. 수집은 Collector DaemonSet(`central-collector`) + `central-instrumentation` CR.

2026-09-10 클러스터 확인: Operator / VM / Loki / Tempo / Grafana / Collector 전부 Running. Instrumentation CR 존재. 이 레포에서 스택 자체로 남은 일 없음.

이 파일은 아래 둘을 합친 아카이브다.

- `docs/superpowers/specs/2026-08-07-monitoring-otel-stack-design.md`
- `docs/superpowers/plans/2026-08-07-monitoring-otel-stack.md`

---

## 배경

workstation 클러스터에 메트릭·로그·트레이스를 한 경로로 모을 스택이 필요했다. 기존 컴포넌트 패턴(`defineComponent`, Helm Release, Istio VirtualService, Authentik OIDC)을 따른다.

## 목표

- `monitoring` NS에 Operator + 백엔드 3종 + Grafana + Collector + central Instrumentation
- Grafana만 `https://grafana.<zone>` 으로 노출, Authentik OIDC 로그인
- `System User` → Viewer, `System Manager` → Admin
- VM / Loki / Tempo는 ClusterIP 전용

## 결정

| 항목 | 결정 |
|---|---|
| 스토리지 | Longhorn PVC (`longhorn-ssd`) |
| 외부 노출 | Grafana만 (기존 `records.grafana` CNAME + Istio VS). DNS 레코드 신규 없음 |
| Grafana 인증 | Authentik OIDC (Argo 패턴). Proxy / ext-authz 없음 |
| 최소 접근 그룹 | `systemUserGroup` |
| Admin 비밀 | `GRAFANA_ADMIN_PASSWORD` → project ESC `grafana.adminPassword` (평문, bcrypt 없음). 로컬 admin은 break-glass |
| 객체 스토리지 | 없음 (MinIO/S3 제외) |
| Operator webhook | `admissionWebhooks.certManager.enabled=true` |

## 아키텍처

경로: `infra/k8s-workstation-system/src/components/monitoring/`

| 컴포넌트 | 역할 |
|---|---|
| `otel-operator.helm-chart` | `monitoring` Namespace + OpenTelemetry Operator Helm, cert-manager webhook |
| `victoria-metrics.helm-chart` | VictoriaMetrics single + PVC |
| `loki.helm-chart` | Loki SingleBinary + filesystem/PVC |
| `tempo.helm-chart` | Tempo single / local PVC |
| `grafana.helm-chart` | Grafana + VM/Loki/Tempo datasource, Ingress 비활성 |
| `otel.resources` | `OpenTelemetryCollector` CR (`mode: daemonset`) + `Instrumentation` CR |
| `grafana.authentik` | OIDC Provider/Application, `systemUserGroup` PolicyBinding |
| `grafana.service-mesh` | Istio VirtualService → Grafana |

배포 순서: cert-manager → otel-operator → (VM ∥ Loki ∥ Tempo) → grafana.authentik → grafana.helm-chart → otel.resources → grafana.service-mesh.

OIDC output/secret은 Grafana Helm values로 한 번에 주입. Grafana 2단계 패치 없음.

데이터 경로: 앱 Pod(Instrumentation annotation) → Collector DaemonSet → VM / Loki / Tempo. Grafana datasource는 in-cluster DNS.

### 수집

- Collector: OTLP(gRPC/HTTP), `filelog`, `kubeletstats`. processors `memory_limiter` / `batch` / `k8sattributes` / `resource`
- Instrumentation 이름: `central-instrumentation`. 타 NS annotation 예: `instrumentation.opentelemetry.io/inject-sdk: monitoring/central-instrumentation`
- CR은 `@pulumi/kubernetes` CustomResource (`Instrumentation`은 `opentelemetry.io/v1alpha1`)

### 스토리지 기본값

| 구성 요소 | 모드 | 보존 |
|---|---|---|
| VictoriaMetrics | single | 15d |
| Loki | SingleBinary + PVC | 7d |
| Tempo | single / local PVC | 3d |

### Grafana

- Ingress 끔, Service ClusterIP, VS만
- Datasource: VM=Prometheus, Loki, Tempo. Tempo↔Loki derivedFields 연결
- OAuth redirect: `https://<grafana-host>/login/generic_oauth`

## 수용 기준

- [x] `monitoring` NS에 Operator, VM, Loki, Tempo, Grafana, Collector DaemonSet, central Instrumentation 기동
- [x] Grafana UI `https://grafana.<zone>`, Authentik OIDC
- [x] `System User` Viewer / `System Manager` Admin
- [x] VM / Loki / Tempo 외부 미노출

## 범위 밖 (당시 YAGNI)

- MinIO / 외부 S3
- VictoriaMetrics 클러스터 모드 / 다중 레플리카 HA
- Grafana 외 백엔드 외부 노출
- Authentik Proxy 앞단 SSO
- 언어별 sampler 세부 튜닝
- Cloudflare DNS 레코드 신규 생성 (이미 존재)

1차 스펙에서 대시보드 대규모 번들도 범위 밖이었다. 이후 같은 폴더에 대시보드·알림이 붙었다 (아래).

## 이후 확장 (별도 해결)

스택 위에 나중에 올라간 것. 이 문서 범위가 아니다.

- Grafana 대시보드: `components/monitoring/dashboards/` (노드·파드 리소스, Loki 로그, NVIDIA DCGM)
- [PVC 사용률 Slack 알림](2026-09-07-pvc-usage-slack-alert.md)

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-08-07 | 설계 승인. 스펙·구현 플랜 작성 |
| 2026-08 초 | `k8s-workstation-system`에 컴포넌트 배선·배포. `monitoring` NS 기동 |
| 2026-09-07 | PVC Slack 알림 (후속, 별도 해결) |
| 2026-09-10 | 클러스터 재확인. 스펙·플랜을 이 파일로 아카이브, 원본 삭제 |
