# ApexCaptain.IaC.Pulumi

Pulumi 기반 IaC 모노레포. Cloudflare, GitHub, Kubernetes(K3s workstation) 인프라를 코드로 관리하며, 공통 유틸리티·Nexus·Custom Resource·Bridged Provider를 공용 패키지로 분리해 재사용한다.

## Workspace 구조

| 경로 | 패키지 | 역할 |
| --- | --- | --- |
| `common/bridged-provider` | `@common/bridged-provider` | Pulumi 미지원/불완전 API를 Terraform Provider로 브리지 |
| `common/custom-resources` | `@common/custom-resources` | 여러 스택에서 재사용하는 커스텀 Pulumi 리소스 |
| `common/nexus` | `@common/nexus` | 스택 간 의존성 오케스트레이션(Contract 패턴) |
| `common/utils` | `@common/utils` | 공통 유틸리티(로깅, 파일 IO, 값 검증 등) |
| `infra/cloudflare` | `@infra/cloudflare` | Cloudflare DNS/Zero Trust 등 엣지 인프라 |
| `infra/github` | `@infra/github` | GitHub 저장소 자동화(PR 생성 시 Slack 알림 등) |
| `infra/k8s-workstation-system` | `@infra/k8s-workstation-system` | K3s 클러스터 시스템 레이어(Cilium, cert-manager, Vault, 모니터링 등) |
| `infra/k8s-workstation-apps` | `@infra/k8s-workstation-apps` | 사용자 서비스 앱(Jellyfin, qBittorrent 등) |
| `infra/k8s-workstation-tools` | `@infra/k8s-workstation-tools` | 운영 도구(Coder, Homepage 등) |

## Infra 배포 순서

```
cloudflare → k8s-workstation-system → k8s-workstation-apps
                                  → k8s-workstation-tools
```

`infra/github`은 GitHub 저장소 설정을 다루는 독립 스택으로 위 K3s 배포 체인과 무관하게 별도로 `pulumi:up`한다.

## 로컬 개발

- `.devcontainer/` 기반 DevContainer 사용 (`mcr.microsoft.com/devcontainers/typescript-node:20`, `docker-in-docker`·`github-cli` feature 포함). 컨테이너 생성 시 `corepack enable && pnpm install`을 자동 실행한다.
- `pnpm script:bootstrapLocalEnv` — 로컬 환경 부트스트랩
- `pnpm script:syncPulumiEsc` — Pulumi ESC 환경 동기화
- `pnpm script:fetchWorkstationKubeconfig` / `pnpm script:mergeKubeConfig` — workstation kubeconfig 조회 및 병합

## 자동화 스크립트

**빌드·테스트**

| 스크립트 | 설명 |
| --- | --- |
| `build:infra` | `infra/*` 패키지만 빌드 |
| `build:workspaces` | `common/*`, `infra/*` 전체 빌드 |
| `test:workspaces` | `common/*`, `infra/*` 전체 테스트 (동시성 2) |

**Pulumi**

| 스크립트 | 설명 |
| --- | --- |
| `pulumi:install` | `common/bridged-provider` 기준 Pulumi 플러그인 설치 |
| `pulumi:preview` | `infra/*` 전체 preview |
| `pulumi:up` | `infra/*` 전체 up (TUI) |
| `postpulumi:up` | kubeconfig 병합 후 Nova/Pluto 진단 리포트 병렬 생성 |

**Git·PR**

| 스크립트 | 설명 |
| --- | --- |
| `script:generateCommitMessage` | 커밋 메시지 초안 생성 |
| `git:commit` | 생성된 커밋 메시지로 커밋 |
| `script:generatePullRequest` | PR 본문 생성 |
| `git:pr` | develop 기준 PR 생성 |
| `git:pr:to-main` | develop → main PR 생성 |
| `script:openPullRequest` | PR 오픈 |
| `script:promoteDevelopToMain` | develop → main 승격 |

**기타**

| 스크립트 | 설명 |
| --- | --- |
| `script:generateNovaDiagnosis` / `script:generatePlutoDiagnosis` | 배포 후 진단 리포트 생성 |
| `script:generateVentoyUserData` | Ventoy 부팅 user-data 생성 |
| `script:synthProjectReadme` | 워크스페이스 패키지 README 합성 |

## 문서

- [열린 이슈 일정](docs/schedule.md)
- [이슈 목록](docs/issues/)
- [해결된 이슈](docs/resolved/)
