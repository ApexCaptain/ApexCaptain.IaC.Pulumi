# VPA 월간 리소스 재조정

| 항목 | 내용 |
|---|---|
| **주기** | **매월 초** |
| **다음** | **2026-12 초** (11월 주기는 2026-10-30 2차로 대체) |
| **영역** | workstation 클러스터 워크로드 requests/limits · Pulumi IaC |
| **관련 코드** | `infra/k8s-workstation-{system,tools,apps}`, `common/custom-resources/.../sftp.v3.component.ts` |
| **이력** | [1·2차 스냅·패치 기록](../issues/resolved/2026-09-08-vpa-resource-rightsizing-followup.md) · [Goldilocks+VPA 배포](../issues/resolved/2026-09-08-goldilocks-vpa-deploy.md) |
| **관련** | [PriorityClass·eviction](../issues/active/2026-09-13-priority-class-resource-protection.md) — 축출 순서. request는 여기 |

마감 조건 없음. 매월 돌리고 `다음`·`docs/schedule.md`만 갱신한다.

## 정책

- **메모리**: VPA `target`(+ 필요 시 `upperBound`) 기준 IaC `requests` 조정. request ≤ limit.
- **CPU**: VPA target idle 편향(~15–25m) → 기존 CPU request/limit 유지. limit < target일 때만 limit 올림.
- **버스티** (jellyfin, qbittorrent, coder): upperBound·Grafana 피크와 교차 확인 후 축소/증가. 피크 여유는 유지 가능.
- **축소**: 두 주기 연속 OVER일 때만. 한 주기 OVER·재시작 직후 짧은 윈도는 보류.
- **바닥값**: target `100Mi` / `15m`은 recommender 바닥. 실사용이 더 낮다는 뜻만 있음 → 판단하지 않음.
- **CronJob**: upperBound 스파이크 무시. target만, limit은 target ≈ 2배.
- **범위 밖**: 차트/CR에 resource values 없는 것(Longhorn CSI·UI, Authentik outpost 등). VPA updater/admission Off 유지. CPU 일괄 축소 금지.

## 체크리스트

- [ ] `kubectl get vpa -A` / Goldilocks UI로 추천 성숙도 확인
- [ ] requests vs target 갭 재분석
- [ ] jellyfin / qbittorrent / coder — Grafana·실사용 피크 교차
- [ ] vault · argo applicationset · reloader — 두 번째 OVER면 축소 (2026-12 초 후보)
- [ ] missing requests 중 IaC로 건드릴 수 있는 것만 선별
- [ ] 안전 항목만 Pulumi 패치 → `pulumi up` → Ready 확인
- [ ] 본문 `다음` + `docs/schedule.md` 다음 달로 갱신
- [ ] 아래 **실행 로그**에 한 줄 append

## 실행 로그

| 일시 | 요약 |
|---|---|
| 2026-10-05 | 1차. 메모리 중심 IaC. 상세는 이력 이슈 |
| 2026-10-12 | 중간 스냅. 상세는 이력 이슈 |
| 2026-10-30 | 2차. grafana·jellyfin·vmsingle UNDER만 반영. OVER(vault·applicationset·reloader) 보류 |
| 2026-12 초 | (예정) 3차 |
