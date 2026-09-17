# ApexCaptain.IaC.Pulumi

Pulumi 기반으로 Cloudflare DNS, GitHub 레포, workstation Kubernetes 클러스터(Cilium·Vault·Istio·Longhorn·Authentik·Argo CD 등)를 코드로 관리하는 모노레포.

## 개요

- pnpm workspace(`common/*`, `infra/*`)와 turbo로 빌드·테스트를 오케스트레이션하고, projen(`.projenrc.ts`)으로 각 패키지 설정을 합성한다.
- `common/*`는 여러 infra 스택이 공유하는 추상화(스택 계약, 유틸, bridged provider, 커스텀 리소스)이고, `infra/*`는 실제로 배포되는 Pulumi 스택이다.

## Workspace 패키지

| 경로                           | 패키지                          | 역할                                                                                |
| ------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------- |
| `common/bridged-provider`      | `@common/bridged-provider`      | Pulumi 미지원 provider(Authentik·ArgoCD·Coderd)를 Terraform bridge로 감싸 재노출    |
| `common/custom-resources`      | `@common/custom-resources`      | 여러 infra 스택이 공유하는 Pulumi 커스텀 컴포넌트·리소스(TLS·backup·vault·coder 등) |
| `common/nexus`                 | `@common/nexus`                 | 스택 간 계약(Contract)·ESC 환경 설정 접근을 표준화하는 코어 추상화                  |
| `common/utils`                 | `@common/utils`                 | 공통 타입·enum·함수·설정 유틸리티                                                   |
| `infra/cloudflare`             | `@infra/cloudflare`             | `ayteneve93.com` zone DNS 레코드 관리 스택                                          |
| `infra/github`                 | `@infra/github`                 | ApexCaptain 계정 GitHub 레포(IaC/GitOps) 카탈로그 관리 스택                         |
| `infra/k8s-workstation-apps`   | `@infra/k8s-workstation-apps`   | workstation 클러스터의 사용자 서비스(Jellyfin 등) 앱 스택                           |
| `infra/k8s-workstation-system` | `@infra/k8s-workstation-system` | 네트워킹·인증서·Vault·Istio mesh·스토리지·IdP 등 클러스터 공통 시스템 스택          |
| `infra/k8s-workstation-tools`  | `@infra/k8s-workstation-tools`  | workstation 클러스터의 도구(qBittorrent 등) 스택                                    |

## Infra 배포 순서

```
cloudflare · github → k8s-workstation-system → k8s-workstation-apps
                                              → k8s-workstation-tools
```

- `cloudflare` — DNS zone/레코드. `system` 스택의 인증서 발급·ingress 호스트 매핑에 필요하다.
- `github` — ApexCaptain 계정 레포 카탈로그(IaC/GitOps). `system` 스택이 GitOps 레포 이름·clone URL을 참조해 Argo CD deploy key·webhook을 붙인다.
- `k8s-workstation-system` — Cilium·cert-manager·Vault·Istio mesh·Longhorn·Authentik·Argo CD 등 클러스터 공통 기반을 구성한다.
- `k8s-workstation-apps` / `k8s-workstation-tools` — `system` 스택 output(mesh gateway, storage class, Authentik group)을 참조하는 사용자 서비스·도구 스택이며 서로 독립적으로 배포할 수 있다.

## 로컬 개발

- `.devcontainer/`의 DevContainer에서 작업한다. projen, Python, GitHub CLI, Pulumi, kubectl, Terraform, k9s, glow, uv 등 도구가 사전 설치된다.
- 컨테이너 라이프사이클은 `initializeCommand.sh` → `updateContentCommand.sh` → `postStartCommand.sh` 순으로 실행된다.
- `pnpm script:bootstrapLocalEnv` — git submodule 초기화(`git submodule update --init --recursive`) 및 `requirements.txt` 기반 Python 의존성 설치.
- `pnpm pulumi:install` — `common/bridged-provider` 기준으로 Pulumi 플러그인을 설치한다.

## 자동화 스크립트

### 빌드·테스트

- `build:workspaces` — `common/*`, `infra/*` 전체 빌드.
- `build:infra` — `infra/*`만 빌드.
- `test:workspaces` — `common/*`, `infra/*` 테스트 (동시성 2).

### Pulumi

- `pulumi:preview` — `infra/*` 전체 프리뷰.
- `pulumi:up` — `infra/*` 전체 배포 (TUI).
- `postpulumi:up` — kubeconfig 병합 후 Nova·Pluto 진단 리포트를 동시 생성.

### Git / PR

- `git:commit` — 생성된 커밋 메시지 파일로 커밋.
- `git:pr` — `develop` 기준 PR 생성.
- `git:pr:to-main` — `develop` → `main` PR 생성.
- `script:generateCommitMessage`, `script:generatePullRequest`, `script:openPullRequest`, `script:promoteDevelopToMain` — 위 Git/PR 흐름에서 쓰는 세부 스크립트.

### 환경 · 운영

- `script:fetchWorkstationKubeconfig`, `script:mergeKubeConfig` — workstation kubeconfig 조회·병합.
- `script:syncPulumiEsc` — Pulumi ESC 동기화.
- `script:generateVentoyUserData` — Ventoy 부팅 미디어용 user-data 생성.

### 진단 · 문서

- `script:generateNovaDiagnosis`, `script:generatePlutoDiagnosis` — 클러스터 진단 리포트를 `docs/diagnosis/`에 생성.
- `script:synthProjectReadme` — workspace 서브모듈 README를 합성한다 (루트 `README.md`는 대상에서 제외).

## 문서

- 열린 이슈와 일정은 [`docs/schedule.md`](docs/schedule.md)에서 확인한다.
- 이슈 원문은 [`docs/issues/`](docs/issues/), 해결된 이슈는 [`docs/resolved/`](docs/resolved/)에 있다.
- 클러스터 진단 리포트(Nova/Pluto)는 [`docs/diagnosis/`](docs/diagnosis/)에서 확인한다.
