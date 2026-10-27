# ApexCaptain.IaC.Pulumi

Pulumi로 Cloudflare·GitHub·워크스테이션 Kubernetes를 선언적으로 관리하는 pnpm 모노레포입니다. `common/*`는 공용 라이브러리, `infra/*`는 독립 Pulumi 스택입니다.

## Workspace 패키지

| 경로 | 패키지 | 역할 |
| --- | --- | --- |
| `common/bridged-provider` | `@common/bridged-provider` | bridged Pulumi provider 설치·공유 |
| `common/custom-resources` | `@common/custom-resources` | 커스텀 Pulumi·Kubernetes 리소스 |
| `common/nexus` | `@common/nexus` | GitHub·자동화 워크플로 연동 |
| `common/utils` | `@common/utils` | 모노레포 공용 유틸 |
| `infra/cloudflare` | `@infra/cloudflare` | Cloudflare DNS·Zero Trust 등 |
| `infra/github` | `@infra/github` | GitHub 리포·설정 등 |
| `infra/k8s-workstation-system` | `@infra/k8s-workstation-system` | 워크스테이션 클러스터 시스템 레이어 |
| `infra/k8s-workstation-apps` | `@infra/k8s-workstation-apps` | 워크스테이션 사용자 애플리케이션 |
| `infra/k8s-workstation-tools` | `@infra/k8s-workstation-tools` | 워크스테이션 플랫폼·도구 |

패키지별 상세는 각 디렉터리의 `README.md`를 참고합니다.

## Infra 배포 순서

upstream 스택 출력·contract를 downstream이 참조합니다. 아래 순서를 지킵니다.

```
cloudflare → k8s-workstation-system → k8s-workstation-apps
                                    → k8s-workstation-tools
```

`infra/github`는 다른 infra 패키지와 contract로 연결될 수 있으며, 스택 배포 전 해당 패키지 README의 upstream·downstream을 확인합니다.

## 로컬 개발

- `pnpm script:bootstrapLocalEnv` — 로컬 개발 환경 초기 설정
- `pnpm pulumi:install` — `common/bridged-provider`에 Pulumi provider 설치 (`--no-dependencies`)
- `pnpm script:fetchWorkstationKubeconfig` — 워크스테이션 kubeconfig 조회
- `pnpm script:mergeKubeConfig` — kubeconfig 병합
- `pnpm script:syncPulumiEsc` — Pulumi ESC 동기화 (실제 secret 값은 README·커밋에 넣지 않음)

빌드·검증:

```bash
pnpm build:workspaces
pnpm test:workspaces
pnpm build:infra
```

## Pulumi (루트)

```bash
pnpm pulumi:preview
pnpm pulumi:up
```

`pulumi:up` 완료 후 `postpulumi:up`이 kubeconfig 병합과 Nova·Pluto 진단 생성을 실행합니다.

## 자동화 스크립트

| 스크립트 | 설명 |
| --- | --- |
| `build:infra` | `infra/*` turbo build |
| `build:workspaces` | `common/*`, `infra/*` turbo build |
| `test:workspaces` | workspace 패키지 Jest 등 테스트 |
| `git:commit` | `.github/generated/commit-message.txt`로 커밋 |
| `git:pr` | `develop` 대상 PR 생성 |
| `git:pr:to-main` | `develop` → `main` PR 생성 |
| `script:generateCommitMessage` | 커밋 메시지 초안 생성 |
| `script:generatePullRequest` | PR 본문 초안 생성 |
| `script:openPullRequest` | 생성된 PR 열기 |
| `script:promoteDevelopToMain` | develop → main 승격 워크플로 |
| `script:generateNovaDiagnosis` | Nova 클러스터 진단 문서 생성 |
| `script:generatePlutoDiagnosis` | Pluto 진단 문서 생성 |
| `script:generateVentoyUserData` | Ventoy user-data 생성 |
| `script:synthProjectReadme` | README 합성 (기본: 루트, `--apply`로 반영, `--all-workspace` 또는 `--package`로 서브모듈) |

합성 결과 미리보기는 `.github/generated/readme/`에 둡니다.

## 문서

- [docs/schedule.md](docs/schedule.md) — 열린 이슈 일정·재검토 시점
- [docs/issues/active/](docs/issues/active/) — 진행·보류 이슈
- [docs/issues/resolved/](docs/issues/resolved/) — 완료 이슈 아카이브
- [docs/diagnosis/](docs/diagnosis/) — Nova·Pluto 등 운영 진단 (별도 SSOT)

일정 표는 언제 무엇을 볼지만 담고, 기능 목록이나 로드맵 대체용이 아닙니다.
