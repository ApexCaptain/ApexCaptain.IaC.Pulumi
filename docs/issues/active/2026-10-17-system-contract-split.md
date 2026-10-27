# `k8s-workstation-system` contract.ts 비대화 (1357줄) — 단계 모듈로 분해

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-17 |
| **우선순위** | 중간 |
| **영역** | `infra/k8s-workstation-system`, `infra/k8s-workstation-tools` |
| **관련 코드** | `infra/k8s-workstation-system/src/contract.ts` (1357줄), `infra/k8s-workstation-tools/src/contract.ts` (623줄) |
| **상태** | **보류** — K8s 1.36 업그레이드 완료 뒤 착수 (대규모 리팩터와 클러스터 업그레이드 동시 진행 금지) |

## 배경

system contract는 Cilium → cert-manager → Vault → Istio → Longhorn → CNPG/Redis → Authentik → Argo 등 20개 컴포넌트를 하나의 async 클로저에서 생성하고 output을 조립한다. 배포 순서 제약은 파일 상단 주석과 `dependsOn`에 흩어져 있다.

## 문제

- 한 파일 수정 범위가 너무 커서 리뷰·충돌·AI 에이전트 컨텍스트 비용이 크다.
- 클로저 안 지역 변수로만 연결돼 단계별 단위 테스트가 불가능하다 (`docs/issues/active/2026-10-17-infra-component-tests.md`).
- Longhorn↔Authentik 3단계 분리처럼 순환 성격 의존이 주석으로만 관리된다.

## 목표

- `src/phases/<phase>.ts`가 `(deps) => { output, secret }`을 반환하는 순수 조립 함수가 된다
- contract는 phase 호출 순서와 최종 output 매핑만 갖는다 (목표 300줄 이하)
- **리소스 URN 변화 0**: 리소스 이름·parent를 바꾸지 않는다. preview diff 0이 필수

## 접근 비교

| 안 | 장점 | 단점 |
|---|---|---|
| A. 같은 스택 안 phase 모듈 분해 | URN 불변, 위험 낮음 | blast radius는 그대로 |
| B. 스택 분할 (platform-core / platform-identity) | blast radius·preview 시간 감소 | `pulumi state move`·StackReference 재배선, 위험 큼 |

## 추천

A 먼저. B는 A 완료 후 별도 이슈로 재평가.

## 수용 기준

- [ ] system contract 300줄 이하, phase 파일별 단일 책임
- [ ] `pnpm pulumi:preview` system·apps·tools 스택 diff 0 (리소스 추가·삭제·replace·update 없음)
- [ ] apps·tools가 참조하는 contract output 타입 불변 (`tsc` 통과)
- [ ] 배포 순서 제약이 phase 호출 순서·`dependsOn` 코드로 표현되고 주석은 이유만 설명

## 범위 밖

- 스택 분할 (B)
- 컴포넌트 내부 리팩터

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-17 | 등록. K8s 1.36 업그레이드 이후 착수로 보류 |
