# `k8s-workstation-tools` contract.ts 비대화 — 단계 모듈로 분해

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-28 |
| **우선순위** | 낮음 |
| **영역** | `infra/k8s-workstation-tools` |
| **관련 코드** | `infra/k8s-workstation-tools/src/contract.ts` (36줄), `src/phases/` (5개) |
| **선행** | [system contract 분해](../resolved/2026-10-17-system-contract-split.md) — 같은 방식 재사용. Sysbox 제거·K8s 1.36은 2026-11-06 완료 |
| **상태** | **해결** |
| **해결일** | 2026-11-11 |

## 해결 요약

737줄 contract를 system과 같은 phase 조립으로 분해. `contract.ts` 36줄. preview tools 133·apps 66 unchanged. `test/contract.test.ts` 추가 (URN snapshot·dependsOn).

## 배경

[system contract 분해](../resolved/2026-10-17-system-contract-split.md)에서 tools contract도 영역에 있었지만 수용 기준은 system만 다뤘다. system 완료 시점(2026-10-28) tools contract는 등록 당시 623줄에서 751줄로 늘었다. 2026-11-04 기준 799줄(Kata·Zero Trust 등). 2026-11-06 Sysbox 제거 커밋(`c48be39`) 이후 737줄.

## 현재 (2026-11-11)

- `src/phases/`: `providers` · `coder` · `vikunja` · `qbittorrent` · `zero-trust`
- `contract.ts` 36줄 — providers + PROD일 때 phase 호출 순서 + 빈 output/secret
- `test/contract.test.ts` + snapshot (최상위 리소스·output/secret 키·dependsOn 13건)
- 리소스 이름·parent 불변. cloudflare Provider는 Zero Trust phase에 유지 (PROD 전용 생성 시점 보존)

| 검증 | 결과 |
|---|---|
| `pulumi preview` tools | 133 unchanged |
| `pulumi preview` apps | 66 unchanged |
| contract output·secret | 빈 객체 유지 (타입 동일) |
| `pnpm test` tools | 18 passed (contract 15 + qbittorrent 3) |

## 목표

system과 같은 방식.

- `src/phases/<phase>.ts`가 `(deps) => { 컴포넌트 }`를 반환하고, contract는 호출 순서와 output 매핑만 갖는다
- 리소스 이름·parent 불변 (URN 변화 0), output 키 순서 불변 (contract hash)
- system `test/contract.test.ts` 방식의 contract 단위 테스트 (최상위 리소스·output 키 snapshot + `dependsOn` 제약)

## 수용 기준

- [x] tools contract 300줄 이하, phase 파일별 단일 책임
- [x] `pnpm pulumi:preview` tools·apps 스택 diff 0
- [x] contract `.d.ts`(output·secret 타입) 전·후 동일
- [x] contract 단위 테스트가 `pnpm test`(tools)·PR Validate에서 통과

## 범위 밖

- 스택 분할
- 컴포넌트 내부 리팩터

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-28 | 등록. system contract 분해 이슈에서 분리 |
| 2026-10-31 | 동시 진행 금지 대상을 Kata PoC에서 Sysbox 스택 제거·K8s 1.36(2026-11-06 이후)으로 갱신 |
| 2026-11-04 | 줄 수 751→799로 갱신. 상태 보류 유지 |
| 2026-11-11 | 실측 737줄(Sysbox 제거 후). `phases/`·contract 테스트 미착수. Sysbox·K8s 1.36 선행 해소 → 착수 가능, 사용자 결정 대기로 보류 유지 |
| 2026-11-11 | phase 분해 적용. contract 737→36줄. preview tools 133·apps 66 unchanged. contract 테스트 추가. 상태 **적용** |
| 2026-11-11 | 사용자 아카이브 승인. `docs/issues/resolved`로 이동 |
