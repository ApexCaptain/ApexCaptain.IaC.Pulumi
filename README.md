# ApexCaptain.IaC.Pulumi

Pulumi와 TypeScript로 워크스테이션 Kubernetes, Cloudflare, GitHub 인프라를 정의·배포하는 pnpm 워크스페이스 모노레포이다.

## 워크스페이스 패키지

| 경로 | 패키지 | 역할 |
| --- | --- | --- |
| `common/bridged-provider` | `@common/bridged-provider` | bridged Pulumi provider SDK와 `pulumi install` 진입점 |
| `common/custom-resources` | `@common/custom-resources` | 커스텀 Pulumi 리소스·컴포넌트 |
| `common/nexus` | `@common/nexus` | Pulumi ESC·스택 contract 허브 |
| `common/utils` | `@common/utils` | 버전 핀·설정·공유 유틸리티 |
| `infra/cloudflare` | `@infra/cloudflare` | Cloudflare DNS 존·레코드 스택 |
| `infra/github` | `@infra/github` | ApexCaptain IaC·GitOps 레포·Actions 시크릿 스택 |
| `infra/k8s-workstation-system` | `@infra/k8s-workstation-system` | 워크스테이션 클러스터 시스템·플랫폼 레이어 |
| `infra/k8s-workstation-apps` | `@infra/k8s-workstation-apps` | Jellyfin·price-quest 등 사용자 대면 앱 |
| `infra/k8s-workstation-tools` | `@infra/k8s-workstation-tools` | Coder·Vikunja·qBittorrent·Zero Trust 도구 스택 |

각 패키지 상세는 해당 디렉터리의 `README.md`를 본다.

## 로컬 개발

루트에서 pnpm 스크립트를 실행한다. 비밀 값은 Pulumi ESC 등 외부 저장소에 두며 README에 기재하지 않는다.

```bash
pnpm install
pnpm script:bootstrapLocalEnv
pnpm build:workspaces
```

클러스터 kubeconfig가 필요하면 `pnpm script:fetchWorkstationKubeconfig`로 가져온 뒤 `pnpm script:mergeKubeConfig`로 병합한다. 배포 후에는 `postpulumi:up` 훅이 kubeconfig 병합과 Nova·Pluto 진단 생성을 실행한다.

## Infra 배포 순서

upstream 스택을 먼저 올린다.

```
cloudflare → k8s-workstation-system → k8s-workstation-apps
                                    → k8s-workstation-tools
```

`@infra/github`는 위 순서와 별도로 필요 시 배포한다.

```bash
pnpm pulumi:install
pnpm build:infra
pnpm pulumi:preview
pnpm pulumi:up
```

## 루트 스크립트

- `build:infra` — `turbo run build --filter "./infra/*"`
- `build:workspaces` — common·infra 워크스페이스 일괄 빌드
- `pulumi:install` — `./common/bridged-provider`에서 bridged SDK(`sdks/`, gitignore) 생성. `pnpm i`보다 먼저
- `pulumi:preview` / `pulumi:up` — infra 패키지 preview·up (TUI)
- `postpulumi:up` — kubeconfig 병합 후 Nova·Pluto 진단 생성
- `script:bootstrapLocalEnv` — 로컬 개발 환경 초기화
- `script:fetchWorkstationKubeconfig` — 워크스테이션 kubeconfig 조회
- `script:mergeKubeConfig` — kubeconfig 병합
- `script:generateNovaDiagnosis` / `script:generatePlutoDiagnosis` — 클러스터 진단 문서 생성
- `script:syncPulumiEsc` — Pulumi ESC 동기화
- `script:syncGithubIssues` — `docs/issues`와 GitHub Issues 미러
- `script:synthProjectReadme` — README 합성 (옵션 `--apply`로 반영)
- `script:generateCommitMessage` / `git:commit` — 커밋 메시지 생성·커밋
- `git:pr` / `git:pr:to-main` — develop·main 대상 PR 생성 보조
- `test:workspaces` / `test:scripts` — 워크스페이스·`scripts/` 테스트

## 검증

```bash
pnpm test:workspaces
pnpm test:scripts
```

패키지 단위 빌드·lint는 `pnpm --filter <패키지명> build` 등으로 실행한다.

## 운영·문서

이슈·일정의 SSOT는 저장소 `docs/` 아래에 있다. 구현 상태는 코드와 Pulumi 스택이 우선이며, 이슈 제목만으로 기능 목록을 대체하지 않는다.

- [열린 이슈 일정](docs/schedule.md)
- [진행 중 이슈](docs/issues/active/)
- [완료·아카이브 이슈](docs/issues/resolved/)
