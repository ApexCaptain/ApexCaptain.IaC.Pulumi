# Goldilocks + VPA 배포 설계

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-08 |
| **영역** | `k8s-workstation-system` 스택 — Helm 컴포넌트 신규 추가 |
| **관련 코드** | `infra/k8s-workstation-system/src/components/{vpa,goldilocks}`, `infra/k8s-workstation-system/src/contract.ts`, `common/nexus/src/esc/common.esc.ts`, `infra/cloudflare/src/components/records/records.workstation.component.ts` |
| **상태** | **해결** |
| **해결일** | 2026-09-08 |
| **후속** | [VPA 추천 기반 리소스 갭 재분석](../issues/2026-09-08-vpa-resource-rightsizing-followup.md) (2026-10 초) |

## 해결 요약

Fairwinds VPA(recommender only) + Goldilocks를 workstation 클러스터에 배포했다. 대시보드는 Istio + Authentik Proxy로 노출 (`https://goldilocks.ayteneve93.com`), Insights 비용 배너는 `enable-cost=false`로 끔. 19개 앱/시스템 NS에 opt-in 라벨을 Pulumi Namespace 소스와 클러스터에 반영. 리소스 requests IaC 조정은 VPA 히스토리가 쌓인 뒤 후속 이슈에서 한다.

---

## 배경

`k8s-workstation-system`/`tools`/`apps` 3개 스택에 Vault, Istio, Longhorn, Authentik, ArgoCD, 모니터링 스택(VictoriaMetrics/Loki/Tempo/Grafana), GPU Operator 등 워크로드가 다수 배포되어 있는데, 리소스 requests/limits 대부분 수동 추정값이다. 단일 노드(`workstation-0`) 클러스터라 실사용량 기반 재조정 필요성이 있다 ([workstation-0 메모리 업그레이드 검토](../issues/2026-09-01-workstation-0-memory-upgrade-planning.md) 참고).

[Goldilocks](https://artifacthub.io/packages/helm/fairwinds-stable/goldilocks) + [VPA](https://artifacthub.io/packages/helm/fairwinds-stable/vpa) (둘 다 Fairwinds `fairwinds-stable` 차트)로 워크로드별 CPU/메모리 추천값을 대시보드로 확인하고자 한다.

## 목표

- VPA recommender로 실사용량 기반 CPU/메모리 추천값 계산.
- Goldilocks 대시보드로 네임스페이스별 추천값을 웹 UI에서 확인.
- 실제 Pod를 자동으로 건드리지 않음 (추천 전용, 관찰만).
- 기존 admin 대시보드(Longhorn/Grafana/ArgoCD)와 동일한 배포 패턴 유지.

## 현재 상태 조사

- `metrics-server` 이미 클러스터에 존재 (`kube-system/metrics-server`, host 제공) → VPA recommender가 별도 설치 없이 바로 사용 가능.
- `charts.fairwinds.com/stable` 레포 미등록 (`common.esc.ts`의 `helmRepositoryUrls`).
- Cloudflare DNS record `goldilocks` (CNAME, proxied) 는 **이미 존재** (`infra/cloudflare/src/components/records/records.workstation.component.ts`) — 사전에 준비되어 있었음. `cloudflareContract.output.zones.ayteneve93com.records.goldilocks`로 참조 가능.
- 최신 차트 버전: `vpa` 5.0.1, `goldilocks` 11.1.0.
- Goldilocks는 VPA recommender 없이 동작 불가 (하드 디펜던시). 서브차트로 VPA를 같이 설치하는 옵션 있으나 Fairwinds 공식 권장은 **분리 설치**.

## 접근 비교

| 항목 | 옵션 A (채택) | 옵션 B |
|---|---|---|
| VPA 설치 범위 | recommender만 (`updater`/`admissionController` 비활성) | 전체 설치 (updater가 Pod 재시작하며 자동 조정, admission webhook 장애점 추가) |
| Goldilocks 대상 네임스페이스 | 기본값 그대로 opt-in 라벨(`goldilocks.fairwinds.com/enabled=true`) — 필요한 곳만 수동 라벨 | 전체 네임스페이스 자동 감시 (`dashboard.flags.on-by-default: true`) |
| 대시보드 노출 | Istio Gateway + Cloudflare DNS + Authentik Proxy(ext-authz) 외부 노출 | `kubectl port-forward`로 내부 전용 |
| 배치 위치 | `k8s-workstation-system`에 독립 top-level 컴포넌트 (`gpu-operator`/`postgresql-operator`와 동일 패턴) | `monitoring` 폴더 하위 |

**추천 사유**: 옵션 A는 "관찰만, 실제 변경 없음"이라는 목표에 부합하고, 기존 저장소 컴포넌트 패턴(Longhorn/qBittorrent의 Authentik Proxy 노출, gpu-operator의 필요 기능만 활성화)을 그대로 재사용해 유지보수 부담이 적다.

## 설계 상세

### 1. ESC — 레포 등록

`common/nexus/src/esc/common.esc.ts`의 `helmRepositoryUrls` 스키마에 `'charts.fairwinds.com/stable': z.string()` 추가. 값은 Pulumi ESC 환경에 `https://charts.fairwinds.com/stable`로 설정.

### 2. `components/vpa/vpa.helm-chart.component.ts`

- Namespace `vpa`, label `istio.io/dataplane-mode: none` (mesh 불필요 — gpu-operator와 동일 취급).
- `kubernetes.helm.v3.Release`: chart `vpa`, repo `charts.fairwinds.com/stable`, version `5.0.1`.
- values:
  ```ts
  {
    recommender: { enabled: true },
    updater: { enabled: false },
    admissionController: { enabled: false },
  }
  ```
- output: `{ namespace }`.

### 3. `components/goldilocks/goldilocks.helm-chart.component.ts`

- Namespace `goldilocks`, label `istio.io/dataplane-mode: ambient` (Grafana/OTel 네임스페이스와 동일 — sidecar 없이 ztunnel L4 mTLS로 ingress 경유).
- Release: chart `goldilocks`, repo 동일, version `11.1.0`, `dependsOn: [vpaHelmChart]`.
- values: VPA/metrics-server 서브차트 끔, `dashboard.flags.enable-cost: false` (Insights 마케팅 배너 비활성).
- output: `{ namespace, services: { goldilocksDashboard: { name: 'goldilocks-dashboard', port: { http: 80 } } } }`.

### 4. `components/goldilocks/goldilocks.service-mesh.component.ts`

Longhorn/qBittorrent와 동일한 Authentik Proxy 패턴 (Outpost가 이미 떠 있으므로 **OutpostProviderAttachment** 사용, bootstrap 재생성 없음):

- `VirtualServiceV1` — host: `cloudflareContract.output.zones.ayteneve93com.records.goldilocks`, gateway: 기존 ingress gateway.
- `authentik.ProviderProxy` (`mode: forward_single`) + `authentik.OutpostProviderAttachment` + `authentik.Application` + `authentik.PolicyBinding`.
- **허용 그룹: `systemUserGroup`**.
- `AuthorizationPolicy` — ingress gateway에서 outpost로 ext-authz 위임.

### 5. `contract.ts` 배선 순서

```
... longhornServiceMesh → authentikOutpost (기존) ...
→ vpaHelmChart
→ goldilocksHelmChart (dependsOn: vpaHelmChart)
→ goldilocksServiceMesh (dependsOn: istioGateway, goldilocksHelmChart; authentikOutpost 이후 위치)
```

## 수용 기준

- [x] `common.esc.ts`에 `charts.fairwinds.com/stable` 레포 URL 등록, ESC 값 설정 확인
- [x] `vpaHelmChart` 배포 — recommender Pod만 Running, updater/admission-controller 리소스 없음
- [x] `goldilocksHelmChart` 배포 — controller + dashboard Pod Running
- [x] 임의 네임스페이스에 `goldilocks.fairwinds.com/enabled=true` 라벨 부여 → VPA(Off 모드) 자동 생성 확인 *(클러스터 적용 + Pulumi Namespace 소스 반영)*
- [x] `https://goldilocks.ayteneve93.com` 접속 시 Authentik으로 리다이렉트 (Proxy 동작 확인). `systemUserGroup` 로그인·대시보드 진입은 브라우저에서 최종 확인
- [x] 배포 후 클러스터 상태 정상 (VPA recommender-only, Goldilocks Pod Ready, VS/AuthzPolicy 존재)

## 범위 밖

- VPA `updater`/`admissionController` 활성화(자동 리소스 조정)는 다루지 않음.
- requests/limits IaC 반영은 후속 이슈 ([갭 재분석](../issues/2026-09-08-vpa-resource-rightsizing-followup.md)).

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-08 | 등록. Goldilocks/VPA 용도 조사, 저장소 기존 패턴(gpu-operator, Longhorn Authentik Proxy) 분석 후 설계 확정 (VPA recommender-only, Goldilocks opt-in 라벨, Authentik systemUserGroup으로 외부 노출) |
| 2026-09-08 | 구현: `components/vpa`, `components/goldilocks`(helm+service-mesh), `contract.ts` 배선, ESC `charts.fairwinds.com/stable` 스키마·`common/prod`·`common/dev` 값 반영. typecheck 통과. 배포는 미실행 |
| 2026-09-08 | 사용자 `pulumi up` 성공. 상태 검증: vpa-recommender 1/1 Running; goldilocks controller 1/1 + dashboard 2/2 Running; VS `goldilocks.ayteneve93.com` + AuthzPolicy CUSTOM; HTTPS→Authentik 302. updater/admission 없음 |
| 2026-09-08 | 접속 확인 OK. opt-in 라벨 19 NS 적용 → VPA(Off) 54개 생성. kube/istio/goldilocks/vpa/Coder 워크스페이스 NS 제외 |
| 2026-09-08 | 동일 라벨을 Pulumi Namespace 소스에 반영 (system/tools/apps 컴포넌트) |
| 2026-09-08 | dashboard `enable-cost=false` — Fairwinds Insights 비용 배너 비활성 |
| 2026-09-08 | 초기 갭 분석(히스토리 짧음) → IaC 조정은 보류. 배포 이슈 해결·아카이브. 후속: 2026-10 초 재분석 |
