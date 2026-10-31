# `k8s-workstation-tools` contract.ts 비대화 (751줄) — 단계 모듈로 분해

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-28 |
| **우선순위** | 낮음 |
| **영역** | `infra/k8s-workstation-tools` |
| **관련 코드** | `infra/k8s-workstation-tools/src/contract.ts` (751줄, 컴포넌트·Provider 생성 23곳) |
| **선행** | [system contract 분해](../resolved/2026-10-17-system-contract-split.md) — 같은 방식 재사용 |
| **상태** | **보류** — 착수 시점 미정. 클러스터 변경(Sysbox 스택 제거·K8s 1.36, 2026-11-06 이후)과 같은 시기에는 진행하지 않는다 |

## 배경

[system contract 분해](../resolved/2026-10-17-system-contract-split.md)에서 tools contract도 영역에 있었지만 수용 기준은 system만 다뤘다. system 완료 시점(2026-10-28) tools contract는 등록 당시 623줄에서 751줄로 늘었다.

## 목표

system과 같은 방식.

- `src/phases/<phase>.ts`가 `(deps) => { 컴포넌트 }`를 반환하고, contract는 호출 순서와 output 매핑만 갖는다
- 리소스 이름·parent 불변 (URN 변화 0), output 키 순서 불변 (contract hash)
- system `test/contract.test.ts` 방식의 contract 단위 테스트 (최상위 리소스·output 키 snapshot + `dependsOn` 제약)

## 수용 기준

- [ ] tools contract 300줄 이하, phase 파일별 단일 책임
- [ ] `pnpm pulumi:preview` tools·apps 스택 diff 0
- [ ] contract `.d.ts`(output·secret 타입) 전·후 동일
- [ ] contract 단위 테스트가 `pnpm test:workspaces`·PR Validate에서 통과

## 범위 밖

- 스택 분할
- 컴포넌트 내부 리팩터

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-28 | 등록. system contract 분해 이슈에서 분리 |
| 2026-10-31 | 동시 진행 금지 대상을 Kata PoC에서 Sysbox 스택 제거·K8s 1.36(2026-11-06 이후)으로 갱신 |
