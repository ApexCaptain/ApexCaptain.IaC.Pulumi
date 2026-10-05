# VPA 추천 기반 리소스 갭 재분석 및 IaC 반영

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-08 |
| **재검토 예정** | **2026-11 초** (약 1달 주기 — 2026-10-05 1차 반영 완료) |
| **영역** | workstation 클러스터 워크로드 requests/limits · Pulumi IaC |
| **관련 코드** | `infra/k8s-workstation-{system,tools,apps}`, `common/custom-resources/.../sftp.v3.component.ts` |
| **선행** | [Goldilocks + VPA 배포](../resolved/2026-09-08-goldilocks-vpa-deploy.md) (해결) |
| **관련 이슈** | [PriorityClass·eviction](2026-09-13-priority-class-resource-protection.md) — 축출 순서. qBit request는 이 이슈에서 |
| **상태** | **적용** — 2026-10-05 VPA(Off) 스냅 기준 IaC 반영·`pulumi up` 완료. **2026-11 초** 동일 절차 반복 |

## 배경

2026-09-08에 VPA recommender + Goldilocks를 배포하고 19개 NS에 opt-in 라벨을 달았다. 당일 스냅샷으로 requests vs VPA target 갭 분석을 돌렸으나, 추천 히스토리가 **수 시간** 수준이라 idle 편향이 큼 (특히 Jellyfin encode, qBittorrent 피크, Coder idle/busy).

바로 IaC에 반영하지 않고 **약 1달 관찰 후(10월 초)** 다시 갭을 보고 조정한다. 무사히 마치면 **매월 초** 같은 작업을 반복한다 (다음: **2026-11 초**).

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

## 2026-10-05 재스냅샷 (68 VPA 컨테이너)

| | Missing | Under | Over | OK |
|---|---|---|---|---|
| MEM | 27 | 27 | 3 | 11 |
| CPU | 27 | 3 | 24 | 14 |

**정책 (1차 반영):**

- **메모리**: VPA `target`(+ 필요 시 `upperBound`) 기준으로 IaC `requests` 조정. request ≤ limit 검증.
- **CPU**: VPA target이 대부분 ~25m로 idle 편향 → **기존 CPU request/limit 유지** (IaC 미변경).
- **버스티**: jellyfin request 768→512Mi (upperBound ~380Mi + headroom). qbittorrent 4→11Gi (VPA UNDER, upperBound ~10.6Gi). coder 512Mi→1Gi.
- **범위 밖**: GPU operator·Longhorn CSI 등 차트 기본/서브컴포넌트-only — IaC values 없으면 미패치.

## 목표

1. **매월 초** VPA status 재조회 → 동일 기준으로 갭 재분석.
2. 안전한 항목만 Pulumi `resources.requests`(/limits) 패치.
3. 버스티 워크로드(jellyfin, qbittorrent, coder)는 upperBound·피크 교차 확인 후 축소/증가.

## 수용 기준

- [x] 2026-10 초 VPA 추천 재스냅샷
- [x] 갭 표 갱신 (위 2026-10-05)
- [x] IaC 패치 + 적용/보류 결정 (본문 정책)
- [x] `pulumi up` (system / tools / apps prod) 및 워크로드 Ready 확인
- [ ] **2026-11 초** 2차 스냅·패치 (일정: `docs/schedule.md`)

## 범위 밖

- VPA updater/admission 자동 적용 (Off 모드 유지).
- Goldilocks/VPA 차트 자체 재구성 (이미 해결됨).
- CPU 일괄 25m 축소 (VPA idle 편향).

## 체크리스트 (2026-11 초 재개 시)

- [ ] `kubectl get vpa -A` / Goldilocks UI로 추천 성숙도 확인
- [ ] requests vs target 갭 스크립트 재실행
- [ ] jellyfin / qbittorrent / coder — Grafana·실사용 피크와 교차 확인
- [ ] missing requests 중 IaC로 건드릴 수 있는 것만 선별

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-08 | 등록. Goldilocks 배포 직후 초기 갭 분석 → 히스토리 부족으로 IaC 보류. 재검토 목표 2026-10 초 |
| 2026-09-13 | 관련: PriorityClass 이슈 등록. qBit 등 request 축소는 계속 이 VPA 이슈(10월 초). 축출 클래스·kubelet은 그쪽 |
| 2026-10-05 | 1차 재스냅(68 컨테이너). 메모리 중심 IaC 패치 — Argo CD, cert-manager, monitoring(Loki/Tempo/Grafana/VM), Longhorn manager, Authentik PG, Reloader, LXCFS, VSO, snapshot-controller, CNPG operator, jellyfin, qbittorrent, coder, vikunja, SFTP v3 sidecar. `k8s-workstation-{system,tools,apps}` prod `pulumi up` 성공. Argo dex request>limit 한 번 실패 → dex limit 256Mi 수정 후 재적용. 다음 주기 **2026-11 초** |
