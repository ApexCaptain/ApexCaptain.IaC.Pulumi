# `k8s-workstation-system` contract.ts 비대화 (1357줄) — 단계 모듈로 분해

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-17 |
| **우선순위** | 중간 |
| **영역** | `infra/k8s-workstation-system`, `infra/k8s-workstation-tools` |
| **관련 코드** | `infra/k8s-workstation-system/src/contract.ts` (1357줄), `infra/k8s-workstation-tools/src/contract.ts` (623줄) |
| **상태** | **적용** — system contract 분해 완료 (2026-10-28, `refactor/system-contract-phases`, 머지 전). tools contract는 미착수 |

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

## 현재 (2026-10-28)

- `infra/k8s-workstation-system/src/phases/` 14개 파일. 각 phase는 `(deps) => { 컴포넌트 }` 동기 함수, 의존은 이전 phase 결과를 인자로 받는다
- `contract.ts` 1357 → 221줄. phase 호출 순서 + output·secret 매핑만. Longhorn↔Authentik 3단계 JSDoc은 contract 호출부에 유지
- 컴포넌트 생성 코드·이름·`dependsOn`은 그대로 옮김. 등록 순서도 기존과 동일
- 바뀐 점: Vault 클러스터 주소 `pulumi.interpolate` 3중복 → `deployVaultServer().clusterAddress` 하나. Authentik 이름 상수 → `phases/constants.ts`
- output 객체 키 순서는 유지 (`TextFileV1` contract hash가 `JSON.stringify` 결과에 의존)

| 검증 | 결과 |
|---|---|
| `pulumi preview --diff` system (전·후) | 268 unchanged / 268 unchanged |
| preview apps·tools | 66 / 143 unchanged |
| contract `.d.ts` 전·후 비교 | output·secret 타입 동일 (import 표기만 다름) |
| `tsc` system·apps·tools, eslint, system jest 10개 | 통과 |

## 접근 비교

| 안 | 장점 | 단점 |
|---|---|---|
| A. 같은 스택 안 phase 모듈 분해 | URN 불변, 위험 낮음 | blast radius는 그대로 |
| B. 스택 분할 (platform-core / platform-identity) | blast radius·preview 시간 감소 | `pulumi state move`·StackReference 재배선, 위험 큼 |

## 추천

A 먼저. B는 A 완료 후 별도 이슈로 재평가.

## 수용 기준

- [x] system contract 300줄 이하, phase 파일별 단일 책임
- [x] `pnpm pulumi:preview` system·apps·tools 스택 diff 0 (리소스 추가·삭제·replace·update 없음)
- [x] apps·tools가 참조하는 contract output 타입 불변 (`tsc` 통과)
- [x] 배포 순서 제약이 phase 호출 순서·`dependsOn` 코드로 표현되고 주석은 이유만 설명

## 범위 밖

- 스택 분할 (B)
- 컴포넌트 내부 리팩터

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-17 | 등록. K8s 1.36 업그레이드 이후 착수로 보류 |
| 2026-10-28 | 대기 조건 변경: "1.36 업그레이드 완료 뒤" → "클러스터 변경 작업과 동시 진행 금지". 1.36은 Sysbox 미지원으로 2027-01-15까지 막힘. 분해는 URN 불변·preview diff 0이라 라이브 변경이 없고, 업그레이드는 Kubespray 쪽이라 겹치지 않음. 후속(contract 단위 테스트)을 풀기 위해 먼저 착수 |
| 2026-10-28 | system contract phase 분해 적용 (`refactor/system-contract-phases`). preview system 268·apps 66·tools 143 unchanged, 타입 불변. tools contract(623줄)는 남음 |
