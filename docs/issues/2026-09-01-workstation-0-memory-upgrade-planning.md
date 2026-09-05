# workstation-0 메모리 업그레이드 검토

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-09-01 |
| **노드** | `workstation-0` (단일 노드 클러스터) |
| **메인보드** | MSI MS-7B86 (B450 TOMAHAWK) |
| **CPU** | AMD Ryzen 7 2700X |
| **상태** | **보류** — 구매 후보 확정, 쿠팡 16GB DDR4-2666 데스크탑 1장 |

---

## 배경

K8s 클러스터 메모리 여유와 Coder 워크스페이스 부하를 고려하여, 기존 설치 램과 동일 사양 추가 구매 여부를 검토했다.

---

## 현재 리소스 사용 (2026-09-01)

### K8s Metrics Server

| 항목 | 값 |
|------|-----|
| 메모리 사용 | 21,888 Mi (**72%**) |
| CPU 사용 | 4,108m (**26%**) |
| Swap | 0 |
| MemoryPressure | 없음 (`KubeletHasSufficientMemory`) |

### 노드 capacity / allocatable

| 항목 | 값 |
|------|-----|
| 물리 메모리 (capacity) | 31,733,608 Ki ≈ **30.2 Gi** |
| allocatable | 30,844,776 Ki ≈ **29.4 Gi** |
| requests 합계 | 16,898,192 Ki (**54%**) |
| limits 합계 | 55,258 Mi (**183%** — overcommit) |

→ 스케줄링 관점 requests 여유는 약 **13 Gi**, 실제 사용은 **~21 Gi**로 requests보다 높음 (특히 Coder 워크스페이스).

### 호스트 실측 (SSH `pnpm ssh:workstation:0`)

```
Mem: 30Gi total | 22Gi used | 8.0Gi available
Swap: 없음
PSI memory: some avg10=0.00 avg60=0.10 avg300=0.12 — 메모리 압박 거의 없음
```

### 메모리 대량 사용 Pod (상위)

| Pod | 메모리 |
|-----|--------|
| `coder-sysbox-ubuntu` (dev 워크스페이스) | **~11 Gi** |
| `kube-apiserver-workstation-0` | ~2.2 Gi |
| longhorn `instance-manager` | ~1.3 Gi |
| `tempo-0` | ~1.1 Gi |
| `jellyfin` | ~470 Mi |

Coder 워크스페이스가 전체 사용량의 약 절반 수준.

---

## 설치된 메모리 하드웨어 (dmidecode)

**보드 공식 최대:** 슬롯당 **16GB**, 합 **64GB** (DDR4-2666 16GB × 4).  
`dmidecode`가 128GB 등 더 큰 값을 보여줄 수 있으나, MS-7B86 매뉴얼·QVL 기준 실사용 상한은 **64GB**이다. **32GB DIMM은 공식 미지원.**

| 슬롯 | 채널 | 용량 | 제조사 | Part Number | 속도 |
|------|------|------|--------|-------------|------|
| DIMM 0, Channel A | **비어 있음** | — | — | — | — |
| DIMM 1, Channel A | 16 GB | Samsung | **M378A2G43MX3-CTD** | DDR4-2667 MT/s |
| DIMM 0, Channel B | 8 GB | Samsung | **M378A1K43CB2-CTD** | DDR4-2667 MT/s |
| DIMM 1, Channel B | 8 GB | Samsung | **M378A1K43CB2-CTD** | DDR4-2667 MT/s |

**현재 합계:** 16 + 8 + 8 = **32 GB** (OS 인식 ~30.2 Gi — 정상)

**형식:** DDR4 UDIMM, Unbuffered, 1.2V, 2667 MT/s

---

## 업그레이드 로드맵

| 단계 | 구성 | 결과 | 비고 |
|------|------|------|------|
| **최종 목표** | DDR4-2666 **16GB × 4** (동일 스펙·가급적 동일 PN) | **64 GB** | B450 TOMAHAWK에서 용량·안정·듀얼채널 모두 최적 |
| **1단계 (현재)** | empty 슬롯에 **16GB 1장** 추가 | **~48 GB** | 최소 비용, Ch A 16+16 균형 |
| **2단계 (최종)** | 8GB 2장 제거 + **16GB 2장** 추가 | **64 GB** | 1단계 이후 8GB 2개만 교체 |

---

## 구매 옵션 비교

| 옵션 | 결과 용량 | 평가 |
|------|-----------|------|
| **16GB 1장** (empty 슬롯, 동급 2666 UDIMM) | **~48 GB** | **1단계 추천** — 최소 비용, Ch A 16+16 균형 |
| 8GB 1장 (empty 슬롯) | ~40 GB | **비추** — Ch A에 8+16 혼합, 채널 내 불균형 |
| **32GB 모듈 1장** (empty 슬롯) | 이론상 ~64 GB | **비추** — 보드 공식 미지원, 인식·안정 불확실 |
| 8GB 2장 제거 + 16GB 2장 추가 | **64 GB** (16×4) | **최종 목표** — 4슬롯 균형, 듀얼채널 최적 |

### 32GB 모듈 1장이 비추인 이유

> K8s 노드로 부적합해서가 아니다. OS가 인식하면 K8s는 총 RAM만 사용한다. 비추 이유는 하드웨어·구성 측면이다.

1. **보드 미지원:** MS-7B86 공식 스펙은 슬롯당 **16GB, 합 64GB** — 32GB DIMM은 QVL 밖. POST 실패·미인식·불안정 가능 (단일 노드에 치명적).
2. **채널 불균형:** Channel A에 32GB + 16GB 혼합 → 듀얼채널 이득 크게 감소.
3. **램 조합:** 32 + 16 + 8 + 8 혼합 → flex 모드도 불리, 성능·안정성 저하 가능.

### 64GB 최종 구성 절차

1. Channel B **8GB 2장 제거**
2. **16GB 2장** 추가 (기존 16GB와 **동일 Part Number** 권장: `M378A2G43MX3-CTD`)
3. 슬롯 배치: 4슬롯 모두 **16GB × 4**

### 모듈 선택 우선순위

1. **Part Number 동일** — 기존 16GB `M378A2G43MX3-CTD`와 같으면 최선
2. **동일 제조사 + 동일 스펙** — Samsung, DDR4-2666/2667, 데스크탑 UDIMM, **2Rx8**, 1.2V
3. **타 제조사** — 스펙이 맞으면 동작할 수 있으나, 단일 K8s 노드에서는 호환 리스크가 큼

→ 제조사는 **가급적 Samsung(기존과 동일)** 이 좋다. Part Number가 다르더라도 (예: `M378A2K43CB1-CTD`) 1장 추가(~48GB) 목적에는 동급이면 보통 적합하나, **최종 64GB 구성 시에는 동일 PN 통일**을 권장한다.

---

## 결론 (현 시점)

| 질문 | 답 |
|------|-----|
| 지금 급한가? | **아니오** — PSI·MemoryPressure 정상, available ~8 Gi |
| 업그레이드 가치? | **있음** — Swap 없음, Coder ~11 Gi, 사용률 72% |
| **최종 목표** | DDR4-2666 **16GB × 4** → **64 GB** (B450 TOMAHAWK 최상 구성) |
| **지금 구매 (1단계)** | empty 슬롯에 **동급 16GB 1장** → ~48 GB (8GB·32GB 아님) |
| 64GB 달성 (2단계) | 8GB 2장 제거 + 16GB 2장 추가 → 16×4 |
| 32GB 모듈 1장 | **비추** — 보드 공식 미지원, K8s 부적합이 아님 |

### 구매 시 체크리스트

- [x] DDR4 **UDIMM**, 2666/2667 MT/s, 1.2V
- [x] 데스크탑용 **288pin DIMM** (노트북 SO-DIMM 아님)
- [x] **16GB 1장** (8GB·32GB 아님)
- [x] **2Rx8** (기존 16GB 모듈과 랭크 일치)
- [x] 제조사 **Samsung** (기존과 동일, 가급적 동일 PN)
- [ ] 입고 후 Part Number·속도·랭크 `dmidecode` 재확인

---

## 구매 후보 (쿠팡)

| 항목 | 내용 |
|------|------|
| **상품** | [삼성전자] DDR4 16GB PC4-21300 / PC4-2666V / 2666MHz / PC용 |
| **Part Number** | **M378A2K43CB1-CTD** (2Rx8, 데스크탑 UDIMM) |
| **판매** | Sevenstar (삼성 정품 유통) |
| **옵션** | 16GB × 1개 |
| **예상 결과** | empty 슬롯 장착 → **~48 GB** |

**링크:** [쿠팡 상품 (9668275634)](https://www.coupang.com/vp/products/9668275634?itemId=28906305063&vendorItemId=85514360077)

```
https://www.coupang.com/vp/products/9668275634?itemId=28906305063&vendorItemId=85514360077
```

### 기존 램과 호환

| 항목 | 구매 후보 | 기존 16GB (Ch A DIMM 1) | 판정 |
|------|-----------|-------------------------|------|
| 용도 | 데스크탑 DIMM (`M378…`) | 데스크탑 DIMM | OK |
| 타입 | DDR4-2666 / PC4-21300 | DDR4-2667 MT/s | OK |
| 용량 | 16 GB | 16 GB | OK |
| Part Number | M378A2K43CB1-CTD | M378A2G43MX3-CTD | 동급 (랭크·칩 구성만 상이) |

→ 완전 동일 PN은 아니지만, Samsung·동급 스펙(16GB 2Rx8 2666 UDIMM)으로 **1단계 empty 슬롯 1장 추가(~48GB)** 에 **적합**으로 판단.  
→ **2단계 64GB** 전환 시에는 `M378A2G43MX3-CTD` 등 **기존 16GB와 동일 PN 2장** 구매를 권장한다.

### 구매 전 최종 확인

- [x] 옵션 **16GB 1개** (8GB·32GB 아님)
- [x] **데스크탑용 / PC용** (노트북·260pin 아님)
- [x] **Samsung** (기존 모듈과 동일 제조사)
- [ ] 입고 후 `sudo dmidecode -t 17`로 Part Number·속도·랭크 재확인

---

## 조사 방법 (재현)

```bash
# K8s 노드 메트릭
kubectl top nodes
kubectl top pods -A
kubectl describe node workstation-0

# 호스트 상세 (SSH)
pnpm ssh:workstation:0

# 메모리 하드웨어
sudo dmidecode -t 17
free -h
cat /proc/pressure/memory
```

---

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-09-01 | K8s·SSH 조사. 현재 32GB (16+8+8), empty 슬롯 1개 확인 |
| 2026-09-01 | 16GB 1장 추가(~48GB) 추천, 32GB 모듈 1장 비추 확정 |
| 2026-09-01 | 쿠팡 후보 확정 — M378A2K43CB1-CTD 16GB DDR4-2666 데스크탑 (상품 9668275634) |
| 2026-09-01 | 검토 보완 — 최종 목표 16GB×4(64GB) 확정, 32GB는 보드 미지원(K8s 무관), 1단계/2단계 로드맵·모듈 선택 우선순위 정리 |
