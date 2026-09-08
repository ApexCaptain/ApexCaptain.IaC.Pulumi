# VPA 추천 기반 리소스 갭 재분석 및 IaC 반영

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-08 |
| **재검토 예정** | **2026-10 초** (약 1달 후 — VPA 추천 히스토리 축적) |
| **영역** | workstation 클러스터 워크로드 requests/limits · Pulumi IaC |
| **관련 코드** | `infra/k8s-workstation-{system,tools,apps}` Namespace·Helm values의 `resources` |
| **선행** | [Goldilocks + VPA 배포](../resolved/2026-09-08-goldilocks-vpa-deploy.md) (해결) |
| **상태** | **보류** — 2026-10 초까지 관찰만. 그때 갭 재분석 후 안전한 항목만 IaC 패치 |

## 배경

2026-09-08에 VPA recommender + Goldilocks를 배포하고 19개 NS에 opt-in 라벨을 달았다. 당일 스냅샷으로 requests vs VPA target 갭 분석을 돌렸으나, 추천 히스토리가 **수 시간** 수준이라 idle 편향이 큼 (특히 Jellyfin encode, qBittorrent 피크, Coder idle/busy).

바로 IaC에 반영하지 않고 **약 1달 관찰 후(10월 초)** 다시 갭을 보고 조정한다.

## 문제

- 수동 추정 requests/limits와 실사용량 불일치 가능.
- 초기 갭 결과는 참고용일 뿐, 지금 깎으면 피크 OOM/스로틀 위험.
- requests 미설정 컨테이너(Longhorn CSI, Tempo, GPU operator 일부 등)는 스케줄링 가시성 부족.

## 2026-09-08 초기 스냅샷 (참고만)

컨테이너 62개 비교. 분류: ratio = target ÷ request. UNDER ≥1.5×, OVER ≤0.67×.

| | Missing | Over ≥2× | Under ≥1.5× | OK |
|---|---|---|---|---|
| CPU | 23 | 19 | 3 | 15 |
| MEM | 23 | 4 | 21 | 14 |

두드러진 후보 (재검토 시 재확인):

| 방향 | 예시 |
|---|---|
| MEM 과다 후보 | qbittorrent 4Gi→~283Mi, jellyfin 768→~363Mi, coder 512→~156Mi |
| MEM 부족 후보 | Argo CD redis 32→100Mi, Authentik PG / Longhorn manager 256→~392Mi |
| requests 없음 | tempo(~1.22Gi target), nvidia-dcgm-exporter(~561Mi), Authentik outpost, Longhorn UI/CSI |
| 이미 양호 | authentik-server / authentik-worker |

캔버스 스냅샷: `.cursor/projects/.../canvases/goldilocks-gap-analysis.canvas.tsx` (로컬 IDE).

## 목표

1. 2026-10 초에 VPA status 재조회 → 동일 기준으로 갭 재분석.
2. 안전한 항목만 Pulumi `resources.requests`(/limits) 패치.
3. 버스티 워크로드(jellyfin, qbittorrent, coder)는 피크 구간 확인 후에만 축소.

## 수용 기준

- [ ] 2026-10 초(또는 그 이후)에 VPA 추천 재스냅샷
- [ ] 갭 표 갱신 (초기 스냅샷과 대비)
- [ ] IaC 패치 후보 목록 + 적용/보류 결정
- [ ] 적용한 항목 `pulumi preview`/`up` 및 Pod Ready 확인

## 범위 밖

- VPA updater/admission 자동 적용 (Off 모드 유지).
- Goldilocks/VPA 차트 자체 재구성 (이미 해결됨).

## 체크리스트 (재개 시)

- [ ] `kubectl get vpa -A` / Goldilocks UI로 추천 성숙도 확인
- [ ] 현재 requests vs target 갭 스크립트 재실행
- [ ] jellyfin / qbittorrent / coder 는 Grafana·실사용 피크와 교차 확인
- [ ] missing requests 중 IaC로 건드릴 수 있는 것만 선별 (차트 기본값 vs 우리 values)

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-08 | 등록. Goldilocks 배포 직후 초기 갭 분석 → 히스토리 부족으로 IaC 보류. 재검토 목표 2026-10 초 |
