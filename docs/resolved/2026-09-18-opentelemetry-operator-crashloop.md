# OpenTelemetry Operator CrashLoop (monitoring)

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-18 |
| **해결일** | 2026-09-18 |
| **영역** | `k8s-workstation-system` / `monitoring` / OTel Operator |
| **관련 코드** | `infra/k8s-workstation-system/src/components/monitoring/otel-operator.helm-chart.component.ts`, `contract.ts` |
| **상태** | **해결** — chart 0.123.0, networkpolicy gate false, 재배포·refresh 후 클러스터 정상 |

## 해결 요약

`operator.networkpolicy` 기본 ON으로 생성된 잘못된 egress(노드 IP:6443)가 in-cluster API(ClusterIP:443)를 막아 CrashLoop. IaC에서 gate 비활성, 문제 NP 제거, chart 0.123.0 배포. 사용자 refresh·배포 후 전반 헬스체크에서 Operator·observability 스택 정상.

## 원인 (특정)

Helm **0.123.0** / Operator **0.159.0** 업그레이드(2026-09-18 13:16 KST) 직후, 기본 feature gate **`operator.networkpolicy`** 가 켜져 Operator가 `NetworkPolicy` `opentelemetry-operator` 를 생성함.

```yaml
# monitoring/opentelemetry-operator (요지)
egress:
  - to:
    - ipBlock:
        cidr: 93.5.22.50/32   # 노드 공인 IP
    ports:
    - port: 6443              # apiserver 호스트 포트
```

Pod는 in-cluster 설정으로 **`https://10.233.0.1:443`** (Service ClusterIP)에 접속하는데, 위 정책은 **443·ClusterIP 경로를 허용하지 않음** → autodetect·controller 초기화 API 호출 실패(TLS timeout / connection reset) → `:8081` health 미기동 → probe 실패 → CrashLoop.

`istio.io/dataplane-mode: none`·chart **0.122.0** 롤백만으로는 **이미 생성된 NetworkPolicy** 가 남아 동일 증상 유지.

## 조치

| 일시 | 내용 |
|---|---|
| 2026-09-18 | IaC: `manager.podAnnotations` `dataplane-mode: none`, CPU request 200m, `featureGatesMap`에서 `operator.networkpolicy`·`operand.networkpolicy` **false** |
| 2026-09-18 | `contract.ts` chart **0.122.0** 롤백 — 0.123는 gate 선행 비활성 후 재시도 |
| 2026-09-18 | `contract.ts` chart **0.123.0**, `pulumi up` prod — Deployment Available, `opentelemetry-operator` NP **없음**, args `--feature-gates=-operand.networkpolicy,-operator.networkpolicy` |
| 2026-09-18 | 클러스터: `kubectl delete networkpolicy opentelemetry-operator -n monitoring` + Pod 재시작 → Deployment **1/1 Available**, 로그 `starting manager` |

## 수용 기준

- [x] `deployment.apps/opentelemetry-operator` Available
- [x] feature gate로 NetworkPolicy **재생성 방지** (IaC)
- [x] chart **0.123.0** / app **0.159.0**, gate false 유지, Operator NP 미생성

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-18 | CrashLoop 등록·API timeout 조사 |
| 2026-09-18 | NetworkPolicy egress 규칙 실증 → **근본 원인** |
| 2026-09-18 | NP 삭제 + IaC gate 비활성 → 복구 |
| 2026-09-18 | 0.123.0 재배포·클러스터 실증 (Available, CrashLoop 없음) |
| 2026-09-18 | 사용자 refresh·배포 후 전반 점검 — 이슈 **해결**·아카이브 |
