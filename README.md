# ApexCaptain.IaC.Pulumi

Pulumi 기반 IaC 모노레포. 홈 쿠버네티스 워크스테이션 클러스터와 Cloudflare·GitHub 등 외부 리소스를 코드로 선언하고, pnpm workspace + turbo로 공통 라이브러리(`common/*`)와 인프라 스택(`infra/*`)을 함께 관리한다.

## Workspace 패키지

| 경로 | 패키지 | 계층 |
| --- | --- | --- |
| `common/bridged-provider` | `@common/bridged-provider` | common |
| `common/custom-resources` | `@common/custom-resources` | common |
| `common/nexus` | `@common/nexus` | common |
| `common/utils` | `@common/utils` | common |
| `infra/cloudflare` | `@infra/cloudflare` | infra |
| `infra/github` | `@infra/github` | infra |
| `infra/k8s-workstation-apps` | `@infra/k8s-workstation-apps` | infra |
| `infra/k8s-workstation-system` | `@infra/k8s-workstation-system` | infra |
| `infra/k8s-workstation-tools` | `@infra/k8s-workstation-tools` | infra |

`common/*`는 Pulumi provider 바인딩, 커스텀 리소스, DI 컨테이너, 공용 유틸리티 등 `infra/*` 스택이 공유하는 추상화를 제공한다. `infra/*`는 실제 Pulumi 프로젝트이며 각각 독립된 스택을 가진다.

## Infra 배포 순서

```
cloudflare → k8s-workstation-system → k8s-workstation-apps
                                  → k8s-workstation-tools
```

`k8s-workstation-system`이 클러스터 플랫폼 레이어(Istio, Vault, 모니터링, 스토리지 등)를 구성한 뒤에만 `k8s-workstation-apps`와 `k8s-workstation-tools`를 배포할 수 있다. `infra/github`은 리포지토리 설정 자체를 다루므로 클러스터 배포 순서와 독립적이다.

## 로컬 개발

- `pnpm script:bootstrapLocalEnv` — 로컬 개발 환경 부트스트랩
- `pnpm script:fetchWorkstationKubeconfig` — 워크스테이션 클러스터 kubeconfig 조회
- `pnpm script:mergeKubeConfig` — 조회한 kubeconfig를 로컬 kubeconfig에 병합
- `pnpm script:syncPulumiEsc` — Pulumi ESC 환경 값 동기화
- `pnpm pulumi:install` — `common/bridged-provider` 기준 Pulumi provider 설치

## 빌드 · 테스트

- `pnpm build:workspaces` — `common/*`, `infra/*` 전체 빌드 (turbo)
- `pnpm build:infra` — `infra/*`만 빌드
- `pnpm test:workspaces` — `common/*`, `infra/*` 전체 테스트 (동시성 2)

## Pulumi 배포

- `pnpm pulumi:preview` — `infra/*` 전체 preview (turbo)
- `pnpm pulumi:up` — `infra/*` 전체 up (turbo, TUI)
- `postpulumi:up` — up 이후 kubeconfig 병합과 Nova·Pluto 진단 리포트 생성을 자동 실행

## 자동화 스크립트

- `pnpm script:generateCommitMessage` — 커밋 메시지 초안 생성
- `pnpm git:commit` — 생성된 커밋 메시지로 커밋
- `pnpm script:generatePullRequest` / `pnpm script:openPullRequest` — PR 본문 생성 및 오픈
- `pnpm git:pr` — `develop` 베이스로 PR 생성
- `pnpm git:pr:to-main` — `develop` → `main` PR 생성
- `pnpm script:promoteDevelopToMain` — `develop`을 `main`으로 승격
- `pnpm script:synthProjectReadme` — 서브모듈 및 루트 README 합성 (`--apply`로 반영, `--all-workspace` / `--package <path>`로 범위 지정)
- `pnpm script:generateNovaDiagnosis` / `pnpm script:generatePlutoDiagnosis` — 클러스터 진단 리포트 생성
- `pnpm script:generateVentoyUserData` — Ventoy 부팅 미디어용 user-data 생성

## 문서

- 열린 이슈와 일정은 [docs/schedule.md](docs/schedule.md)에서 관리한다.
- 이슈 원문은 `docs/issues/`, 해결된 이슈는 `docs/resolved/`에 보관한다.
