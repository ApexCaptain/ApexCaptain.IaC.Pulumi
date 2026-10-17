# CI에 `pulumi preview`·drift 감지가 없음

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-17 |
| **우선순위** | 높음 |
| **영역** | `.github/workflows/`, `projenrc/workflows/`, Pulumi ESC, workstation 클러스터 |
| **관련 코드** | `projenrc/workflows/pr-validation.ts`, `.github/workflows/pr-validation.yml`, `infra/*/package.json` (`pulumi:preview`) |
| **선행** | [PR CI 검증 파이프라인](../resolved/2026-09-11-pr-ci-validation-pipeline.md) — `pulumi preview`·OIDC를 범위 밖으로 명시 |
| **상태** | **조사중** — 클러스터 도달 경로·자격 증명 방식 결정 전 |

## 배경

`pr-validation`은 install → `ai:doctor` → build → test → eslint만 돈다. `pulumi preview`는 로컬에서만 실행된다. 레포는 **PUBLIC**이다.

## 문제

- Helm values 오류, provider 스키마 변경, 의도치 않은 replace가 머지 뒤 로컬 `pulumi:up` 때야 보인다.
- 클러스터를 손으로 바꾸거나 operator가 필드를 바꾼 drift를 아무도 모른다. 다음 up에서 덮어쓰거나 실패한다.
- 주간 `upgrade-develop` PR이 의존성을 올려도 preview 결과 없이 머지된다.

## 제약

- workstation K8s API는 홈 네트워크에 있다. GitHub-hosted runner에서 도달 가능한지 미확인 (공개 노출은 하지 않는 게 원칙).
- public 레포에 self-hosted runner를 `pull_request` 트리거로 붙이면 fork PR이 임의 코드를 클러스터 네트워크에서 실행할 수 있다.
- 자격 증명: Pulumi Access Token 또는 Pulumi OIDC(GitHub → Pulumi Cloud) + ESC.

## 접근 비교

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| A. 클러스터 내 self-hosted runner (ARC) | runner scale set을 클러스터에 배포 | API 도달 문제 없음 | public 레포 보안. fork PR 차단·환경 승인 필수 |
| B. GitHub-hosted + Tailscale | `tailscale/github-action`으로 tailnet 합류 | runner 관리 없음 | 클러스터에 Tailscale subnet router 필요, 키 관리 |
| C. 클러스터 내 CronJob drift 감지만 | `pulumi preview --expect-no-changes` 주기 실행 → Slack | PR 경로와 분리, 보안 단순 | PR 시점 preview 없음 |
| D. Pulumi Cloud Deployments drift detection | Pulumi Cloud 기능 사용 | 관리 최소 | 요금제·클러스터 도달 문제 동일 (확인 필요) |

## 추천 (가설, 플랜에서 확정)

1단계 C: 스케줄 drift 감지부터 (보안 노출 0, 바로 가치). 2단계 A: ARC runner + `push`(develop) / `workflow_dispatch` / 같은 레포 브랜치 PR만 허용, `environment` 승인 게이트. 결과는 PR 코멘트.

## 수용 기준

- [ ] 클러스터 도달 경로와 자격 증명 방식 결정, 근거 기록
- [ ] 매일 1회 5개 스택 `preview --expect-no-changes`, drift 시 Slack 알림
- [ ] (2단계) develop 대상 PR에서 변경 스택 preview 요약이 PR 코멘트로 남음
- [ ] fork PR에서 preview job이 실행되지 않음을 확인
- [ ] 시크릿이 로그·코멘트에 노출되지 않음 (`--suppress-outputs` 등)

## 범위 밖

- CI에서 `pulumi up` (자동 배포)
- policy pack 실행

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-17 | 등록. 프로젝트 평가에서 도출 |
