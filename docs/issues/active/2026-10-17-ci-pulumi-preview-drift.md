# CI에 `pulumi preview`·drift 감지가 없음

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-17 |
| **우선순위** | 높음 |
| **영역** | `.github/workflows/`, `projenrc/workflows/`, Pulumi ESC, workstation 클러스터 |
| **관련 코드** | `projenrc/workflows/pr-validation.ts`, `.github/workflows/pr-validation.yml`, `projenrc/workflows/upgrade.ts`, `infra/*/package.json` (`pulumi:preview`) |
| **선행** | [PR CI 검증 파이프라인](../resolved/2026-09-11-pr-ci-validation-pipeline.md) — `pulumi preview`·OIDC를 범위 밖으로 명시 |
| **관련** | [stateful protect](../resolved/2026-10-17-stateful-resource-protect.md) (선행 충족), [pr-validation 속도](../resolved/2026-11-04-pr-validation-speedup.md) (preview는 범위 밖) |
| **상태** | **보류** — 2026-10-19 사용자 결정. 재개 시 클러스터 도달 경로·자격 증명 방식부터 결정 |
| **점검일** | 2026-11-11 |

## 현재 상태 (2026-11-11 코드·클러스터 대조)

- **증상 그대로.** CI에 `pulumi preview` / drift 감지 워크플로·Job 없음. 로컬 `pnpm pulumi:preview` / 스택별 `pulumi:preview`만 존재.
- **`pr-validation`** (`ubuntu-latest`, 시크릿 없음): Checkout(`fetch-depth: 0`) → pnpm/Node → install → turbo `.turbo` cache → `ai:doctor` → `scripts/ci-pr-build-workspaces.sh`(`turbo --affected` 또는 루트 변경 시 전량) → `test:scripts` → `pnpm exec projen eslint`. preview 단계 없음.
- **워크플로 목록** (`.github/workflows/`): `pr-validation`, `upgrade-develop`, `auto-merge-develop`, `pull-request-lint`, `docs-issue-mirror`. preview/drift 전용 없음.
- **`upgrade-develop`**: 주간 의존성 업그레이드. Pulumi CLI + `PULUMI_ACCESS_TOKEN`은 `projen upgrade`용. preview/검증 없음 → 업그레이드 PR도 preview 없이 머지 가능.
- **스택 5개** (`infra/`): `cloudflare`, `github`, `k8s-workstation-system`, `k8s-workstation-apps`, `k8s-workstation-tools`. 각각 `pulumi:preview` / `pulumi:up`(`preview --expect-no-changes \|\| up`) 스크립트 있음.
- **K8s 도달**: system/apps/tools는 ESC `workstationKubeconfig`로 provider 구성. Cloudflare Zero Trust(`k8s-workstation-tools` zero-trust phase)는 **메인 PC RDP/SSH**(사설 라우트 `/32`, Gateway 3389·8022)만. K8s apiserver용 private route/hostname **없음**. cloudflared connector는 클러스터 안에 있으나 API 노출 용도가 아님.
- **클러스터 CronJob**: backup·sftp 등만. `pulumi preview` / drift CronJob **없음** (MCP `batch/v1 CronJob` 전역 목록 확인).
- **선행**: stateful `protect` 반영 완료(2026-10-17). pr-validation 속도 개선 완료(2026-11-04) — preview는 계속 별 이슈.

## 배경

`pr-validation`은 정적 검증만 한다. `pulumi preview`는 로컬에서만 실행된다. 레포는 **PUBLIC**이다.

## 문제

- Helm values 오류, provider 스키마 변경, 의도치 않은 replace가 머지 뒤 로컬 `pulumi:up` 때야 보인다.
- 클러스터를 손으로 바꾸거나 operator가 필드를 바꾼 drift를 아무도 모른다. 다음 up에서 덮어쓰거나 실패한다.
- 주간 `upgrade-develop` PR이 의존성을 올려도 preview 결과 없이 머지된다.

## 제약

- workstation K8s API는 홈 네트워크에 있다. GitHub-hosted runner에서 도달 불가(원칙상 공인 노출 안 함). Zero Trust로 apiserver를 열어 둔 적도 없음(위 현재 상태).
- public 레포에 self-hosted runner를 `pull_request` 트리거로 붙이면 fork PR이 임의 코드를 클러스터 네트워크에서 실행할 수 있다.
- 자격 증명: Pulumi Access Token(이미 `upgrade-develop`에 시크릿 존재) 또는 Pulumi OIDC(GitHub → Pulumi Cloud) + ESC. K8s 스택은 ESC kubeconfig(또는 동등한 in-cluster SA) 필요. `cloudflare`/`github` 스택은 K8s API 불필요 — GitHub-hosted만으로도 preview 가능(자격 증명만 있으면).

## 접근 비교

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| A. 클러스터 내 self-hosted runner (ARC) | runner scale set을 클러스터에 배포 | API 도달 문제 없음 | public 레포 보안. fork PR 차단·환경 승인 필수 |
| B. GitHub-hosted + Tailscale | `tailscale/github-action`으로 tailnet 합류 | runner 관리 없음 | 클러스터에 Tailscale subnet router 필요, 키 관리 |
| C. 클러스터 내 CronJob drift 감지만 | `pulumi preview --expect-no-changes` 주기 실행 → Slack | PR 경로와 분리, 보안 단순 | PR 시점 preview 없음 |
| D. Pulumi Cloud Deployments drift detection | Pulumi Cloud 기능 사용 | 관리 최소 | 요금제·클러스터 도달 문제 동일 (확인 필요) |
| E. Zero Trust로 K8s API 도달 (후보) | WARP/터널에 apiserver 사설 라우트 추가 후 hosted runner 또는 Deployments | 기존 ZT 인프라 활용 | **현재 미구현**. RDP 전용. API 노출·인증·RBAC 설계 필요 |

## 추천 (가설, 플랜에서 확정)

1단계 C: 스케줄 drift 감지부터 (보안 노출 0, 바로 가치). 2단계 A: ARC runner + `push`(develop) / `workflow_dispatch` / 같은 레포 브랜치 PR만 허용, `environment` 승인 게이트. 결과는 PR 코멘트. (비-K8s 스택은 hosted runner preview를 먼저 붙이는 것도 선택지.)

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
| 2026-10-19 | 보류. 재개 시 후보 추가 검토: Cloudflare Zero Trust Tunnel(`f087b2a`, `k8s-workstation-tools`)로 K8s API 도달 가능 여부 (미확인) |
| 2026-11-11 | 코드·클러스터 재점검. preview/drift CI·CronJob 여전히 없음. `pr-validation`은 turbo cache·`--affected`·`test:scripts`로 바뀌었으나 preview는 미포함. Zero Trust는 메인 PC RDP/SSH만 — K8s API 라우트 없음. 상태 보류 유지 |
