# PVC 사용률 임계치 Slack 알림


| 항목        | 내용                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **등록일**   | 2026-09-07                                                                                                                                                          |
| **영역**    | `infra/k8s-workstation-system` monitoring (OTel → VictoriaMetrics → Grafana)                                                                                        |
| **관련 코드** | `infra/k8s-workstation-system/src/components/monitoring/otel.resources.component.ts`, `victoria-metrics.helm-chart.component.ts`, `grafana.helm-chart.component.ts` |
| **상태**    | **해결** |
| **해결일**   | 2026-09-07 |


---

## 해결 요약

PVC 사용률을 OTel kubeletstats volume 메트릭으로 수집하고, Grafana Unified Alerting → Slack으로 알린다. 임계 **70%**, `for` 10m, 발송 창 **토 01:00–01:30 Asia/Seoul**, digest(`group_by: alertname`). webhook은 Secret `grafana-alerting-slack`. 수신 확인됨. ESC upsert·토 새벽 창 실수신은 운영 확인 수준 후속.

---

## 배경

클러스터 Bound PVC가 다수 있다 (Longhorn 위주: jellyfin media 2Ti, qbittorrent, Coder 워크스페이스 등).  
사용량이 요청 용량의 일정 비율(예: 70%)을 넘으면 Slack으로 모아 알리고 싶다.

현재 모니터링 스택:

- OTel Collector DaemonSet (`kubeletstats` + prometheus scrape) → VictoriaMetrics single → Grafana
- **알림 경로 없음** (vmalert / Alertmanager / Grafana contact point 미구성)
- VictoriaMetrics에 **PVC/볼륨 usage 메트릭 없음** (`k8s_volume_`* 부재). `kubeletstats` 기본 그룹은 `container` / `pod` / `node`만 수집

---

## 목표

1. 마운트된 PVC(또는 동등 볼륨) 사용률을 주기적으로 수집
2. 임계치(**50%**, 확정) 이상인 항목만 골라 Slack 알림
3. 가능하면 “하나씩”이 아니라 **임계치 초과 목록을 한 메시지(또는 짧은 digest)** 로 전달
4. IaC(`k8s-workstation-system`)로 재현 가능하게 유지

---

## 현재 상태 (2026-09-07 실측)


| 항목                 | 상태                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| PVC                | 다수 Bound (`longhorn-ssd` / `longhorn-hdd` / `local-path` 등)                                                                              |
| volume 메트릭         | **수집 중** — `k8s_volume_*` + `k8s_volume_type=persistentVolumeClaim` |
| kube-state-metrics | **없음** — volume capacity로 한도(C1) 사용 중                                                                                                      |
| 알림 엔진              | Grafana Unified Alerting — rule `pvc-usage-high`, contact `infra-alerts-slack`, repeat 72h |
| Slack              | Secret `grafana-alerting-slack` 마운트. ConfigMap에 webhook **없음**(수정 후). ESC upsert는 후속(env fallback 동작 중) |


---

## 접근 비교

### A. 메트릭 소스


| 옵션                                    | 장점                        | 단점                                              |
| ------------------------------------- | ------------------------- | ----------------------------------------------- |
| **A1. kubeletstats `volume` 그룹**      | 이미 OTel 있음. 패치 범위 작음      | 마운트된 볼륨만. claim/request 라벨은 추가 설정·RBAC 필요할 수 있음 |
| A2. Longhorn metrics scrape           | Longhorn 상세               | Longhorn PVC만. `local-path`(vault 등) 빠짐         |
| A3. kube-state-metrics + volume usage | request size와 usage 조인 정확 | 컴포넌트 추가                                         |


**추천 (1차):** **A1**. 분모가 “파일시스템 capacity ≈ 요청”이면 충분.  
request를 엄밀히 쓰려면 이후 A3 또는 k8s API 메타 보강.

### B. 알림 경로


| 옵션                                       | 장점                                     | 단점                                                       |
| ---------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| **B1. Grafana Unified Alerting → Slack** | Grafana 이미 운영 중. contact point만 추가하면 됨 | Grafana 장애 시 알림도 같이 죽음. “목록 digest”는 알림 메시지 템플릿/쿼리 설계 필요 |
| B2. vmalert + Alertmanager → Slack       | 메트릭 경로와 분리                             | 차트·컴포넌트 신규. 운영 면 증가                                      |
| B3. CronJob이 VM query → webhook          | 구현 단순·digest 만들기 쉬움                    | 중복 억제·상태 관리를 직접 짜야 함                                     |


**추천:** **B1** (최소 인프라). digest UX가 부족하면 나중에 B3 보조.

### C. 분모 정의 (한도 = PVC 용량)

목표 자체는 단순하다: **각 PVC 한도 대비 사용 %** = `사용량 / 한도`. 이상한 기준 아님.

C1/C2는 “한도를 메트릭 어디서 읽느냐”만 다름. 둘 다 같은 의도.


| 옵션                      | 한도 출처                                 | 의미                                                              |
| ----------------------- | ------------------------------------- | --------------------------------------------------------------- |
| **C1. volume capacity** | kubelet이 보고하는 마운트 볼륨 `capacity`       | 대개 Bound PVC의 할당 크기와 같음. OTel volume 메트릭만으로 `usage/capacity` 가능 |
| C2. PVC request         | `PVC.spec.resources.requests.storage` | 스펙에 적은 요청값 그대로. kube-state-metrics 등 조인 필요할 수 있음                |


Bound + 정상 프로비저닝이면 C1 ≈ C2.  
차이 나는 경우 예: thin provision, 수동 resize 후 스펙/실용량 불일치, 특수 StorageClass.

**추천:** 목표 = PVC 한도 % (사용자 의도). 구현 1차는 **C1**으로 같은 숫자를 얻고, 괴리 보이면 C2로 보강.

---

## 추천 로드맵 (단계)


| 단계         | 내용                                                           | 사용자 결정     | 외부 정보                          |
| ---------- | ------------------------------------------------------------ | ---------- | ------------------------------ |
| **0. 결정**  | 아래 “의사결정” 확정                                                 | 필요         | Slack webhook 등                |
| **1. 메트릭** | `kubeletstats`에 `volume` 추가 (+ 필요 시 PVC 메타·RBAC). VM에 시리즈 확인 | 분모 C1/C2   | 없음                             |
| **2. 검증**  | Grafana Explore/대시보드로 사용률 쿼리. 미마운트 PVC는 안 나옴을 문서화            | exclude 목록 | 없음                             |
| **3. 알림**  | Grafana contact point(Slack) + 임계치 룰                         | 채널·임계치·for | **Slack Webhook URL** (또는 Bot) |
| **4. 다듬기** | digest 문구, 재알림, resolve, NS exclude                          | 메시지 톤      | 없음                             |


코드 변경은 **단계 확정 후**만. 지금은 문서·결정만.

---

## 의사결정 — **단계 0 확정**

구현 시작 OK (단계 1부터).

### D1. 한도(분모) 메트릭 출처 — 목표 “PVC 한도 %”는 이미 확정

- [x] **C1** kubelet volume `capacity`로 한도 읽기 (1차 추천, 보통 request와 동일)
- [ ] **C2** PVC `requests.storage`로 한도 읽기 (스펙 엄밀, 추가 작업)

### D2. 알림 경로

- [x] **B1** Grafana → Slack (추천)
- [ ] **B2** vmalert + Alertmanager
- [ ] **B3** CronJob → webhook

### D3. 임계·타이밍 — **확정 (재조정)**

- 임계치: **70%**
- `for`: **10m**
- 평가 간격: **1m** (규칙 그룹이 1분마다 쿼리·평가)
- 재알림 간격: **168h** (주 1회 창과 맞춤)

### D7. 알림 시각 — **확정**

- **G1** Grafana `active_time_intervals`
- 창: **토요일 01:00–01:30 Asia/Seoul**
- interval 이름: `sat-0100-kst`

---

## 수용 기준

- [x] VictoriaMetrics에 PVC/볼륨 usage·capacity(또는 동등) 시리즈가 주기적으로 적재됨
- [x] **마운트된 PVC**만 알림 대상 (전 NS, `k8s_volume_type=persistentVolumeClaim`)
- [x] Slack 지정 채널에 알림 도착 확인 (사용자, rotate·rebuild·재배포 후)
- [x] 재알림 간격 **약 72h** / resolve 설정 프로비저닝됨
- [x] webhook이 git에 커밋되지 않음 (Secret 마운트; ConfigMap 평문 제거)
- [x] 임계치 상향 반영 (**70%**)
- [x] 주간 토 01:00–01:30 KST 발송 창 반영 (`sat-0100-kst`)

---

## 범위 밖 (후속 이슈로 분리)

- PVC 자동 확장 (resize / Longhorn expansion)
- 노드 디스크 / Longhorn disk pressure 알림 (별 규칙)
- 미마운트 PVC의 “요청만 있고 사용량 모름” 감시
- PagerDuty 등 Slack 외 채널

---

## 타임라인


| 일시         | 내용                                          |
| ---------- | ------------------------------------------- |
| 2026-09-07 | 등록. 현황 조사 요약 + 단계·의사결정·외부 정보 정리. 구현 대기      |
| 2026-09-07 | C1/C2 설명 보완: 목표는 PVC 한도 %, C는 한도 메트릭 출처만 구분 |
| 2026-09-07 | D3 확정: 50% / for 10m / 재알림 72h. D5 전 NS. D6 Ventoy식 전용 webhook → `slack.env` 신규 키 |
| 2026-09-07 | 키 이름 `SLACK_WEBHOOK_URL_INFRA_ALERTS` 확정. 채널명 비필수. 채팅 URL 노출 → rotate 권고 |
| 2026-09-07 | 단계 0 점검: 결정·env 키·gitignore 통과. rotate 미확인. 단계 1 대기 |
| 2026-09-07 | 사용자: rotate 생략 수용, Slack 실발송 확인. 단계 0 완료 → 단계 1 진행 OK |
| 2026-09-07 | 구현·배포: kubeletstats volume+PVC RBAC, Grafana alert 50%/10m/72h, Slack contact. 실측 PVC≥50%: qbittorrent-complete-downloads·jellyfin-media |
| 2026-09-07 | 알림 expr에 `k8s_volume_type="persistentVolumeClaim"` 필터 추가(emptyDir 노이즈 제거) |
| 2026-09-07 | webhook을 ConfigMap에서 Secret `grafana-alerting-slack` 마운트로 이동. 과거 ConfigMap 노출분 rotate 재권고 |
| 2026-09-07 | 사용자: rotate·rebuild·pulumi 완료, Slack 수신 확인. 임계 상향·토 01:00 KST 주간 발송 검토 시작 |
| 2026-09-07 | 확정·적용: 임계 70%, active_time_intervals 토 01:00–01:30 Asia/Seoul, repeat 168h |
| 2026-09-07 | 사용자 요청으로 해결·아카이브 (`docs/resolved`) |


