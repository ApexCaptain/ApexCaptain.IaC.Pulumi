# bridged-provider sdks를 git에서 제거하고 재생성 가능하게

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-11-12 |
| **영역** | `common/bridged-provider` · 루트 Projen · DevContainer sync · PR CI |
| **관련 코드** | `projenrc/projects/common-projects.ts`, `.projenrc.ts` (defaultTask·gitignore·`pulumi:install`·pr-validation), `.devcontainer/commands/common/synchronizeProject.sh`, `common/bridged-provider/Pulumi.yaml`, `common/bridged-provider/sdks/` |
| **상태** | **해결** |
| **해결일** | 2026-11-12 |

## 해결 요약

`sdks/`를 gitignore하고 `Pulumi.yaml`만 추적. CI·DevContainer·upgrade가 `pnpm pulumi:install`을 `pnpm i`보다 먼저 실행해 삭제·클론 후에도 재생성된다.

## 배경

`@common/bridged-provider`는 Terraform 브리지 SDK를 `pulumi install`로 `sdks/{authentik,argocd,coderd}`에 생성하고, `package.json`이 `file:sdks/*`로 의존한다.

생성물(약 200파일·5MB)이 git에 트래킹된다. CLI(`pulumiCliVersion`)·브리지(`terraformBridgeConverterVersion`)·provider 버전 고정으로 재현은 가능하지만, 커밋 노이즈·리뷰 부담이 크다.

과거에는 `pnpm projen` / `pnpm i` 순서가 `file:sdks` 존재를 전제로 해서, 삭제·미생성 시 install이 깨지지 않도록 **의도적으로 트래킹**했다.

## 문제

1. **생성물이 git SSOT.** provider 버전 bump마다 SDK 파일 대량 diff.
2. **닭-달걀.** `file:sdks/*` → `pnpm i`는 디렉터리 필요. SDK는 `pulumi install`이 `Pulumi.yaml` 보고 생성. `Pulumi.yaml`은 루트 `Pulumi*.yaml` gitignore로 **미추적**.
3. **경로별 순서 불일치.**
   - `pnpm projen` defaultTask: synth → `pulumi:install` → `pnpm i` (상대적 OK)
   - DevContainer `synchronizeProject.sh`: `pnpm i` → build → `pnpm projen` (sdks 없으면 첫 `pnpm i` 실패)
   - PR CI: `pnpm i --frozen-lockfile`만 (현재는 커밋된 sdks에 의존, Pulumi CLI 미설치)

## 목표

- `common/bridged-provider/sdks/` **gitignore**, git에서 제거.
- sdks를 지워도 `pulumi:install`(또는 `pnpm projen`)로 복구 후 `pnpm i`·build·CI가 통과.
- 새 클론·DevContainer sync·PR validate 모두 동일 전제.

## 접근 비교

| 방식 | 요지 | 장단 |
|---|---|---|
| **A. Pulumi.yaml 추적 + sdks gitignore + install 선행** | `!common/bridged-provider/Pulumi.yaml`만 예외 추적. 모든 cold path에서 `pulumi:install` → `pnpm i` | 최소 추적 파일. CI에 Pulumi CLI·네트워크 필요. **추천** |
| **B. synth 시 stub 패키지** | projen/스크립트가 최소 `package.json` stub 생성 후 `pnpm i`, 이후 `pulumi install`이 덮어씀 | 첫 `pnpm i`는 쉬움. stub·실SDK 이중 관리, projen JsonFile과 pulumi 덮어쓰기 충돌 위험 |
| **C. 레지스트리 퍼블리시** | 생성 SDK를 npm/private에 올림 | 이 레포 규모·버전 고정 방식과 불일치. 과도함 |

## 추천

**A.**

세부 결정:

| 항목 | 결정 |
|---|---|
| gitignore | `common/bridged-provider/sdks/` (루트 또는 bridged-provider 프로젝트) |
| Pulumi.yaml | 루트 gitignore에 `!/common/bridged-provider/Pulumi.yaml` 추가 후 추적. SSOT는 여전히 `.projenrc` / `src/constants` → projen 생성 |
| cold path | `pulumi:install` → `pnpm i` → (build / projen) |
| CI | PR validate: Setup Pulumi → `pnpm pulumi:install` → `pnpm i --frozen-lockfile` |
| sync | `synchronizeProject.sh`도 동일하게 install 선행 |
| 제거 | `git rm -r --cached common/bridged-provider/sdks` (워킹트리 파일은 유지 가능, ignore 후 로컬 재생성) |

## 구현 계획

1. 루트 `gitignore`에 `common/bridged-provider/sdks/` 추가, `!/common/bridged-provider/Pulumi.yaml` 예외 추가 (`.projenrc.ts` SSOT).
2. `common/bridged-provider/Pulumi.yaml`을 git에 추가 (`git add -f`).
3. `projenrc/workflows/pr-validation.ts`: Setup Pulumi + `pnpm pulumi:install`을 Install dependencies **앞**에 삽입.
4. `.devcontainer/commands/common/synchronizeProject.sh`: `pnpm pulumi:install`을 첫 `pnpm i` 앞으로 이동.
5. upgrade 워크플로: Install dependencies 전에 `pnpm pulumi:install` 확인(Setup Pulumi는 이미 있음).
6. README(`common/bridged-provider`, 루트)에 재생성 절차 한 줄.
7. `pnpm projen`으로 생성물 동기화.
8. `git rm -r --cached common/bridged-provider/sdks`.
9. 검증: sdks 삭제 → `pnpm pulumi:install` → `pnpm i` → `pnpm --filter @common/bridged-provider build` (및 필요 시 `pnpm build:workspaces`).

## 수용 기준

- [x] `git check-ignore -v common/bridged-provider/sdks/argocd/package.json`이 ignore로 나옴
- [x] `common/bridged-provider/Pulumi.yaml`이 tracked
- [x] `git ls-files common/bridged-provider/sdks`가 비어 있음
- [x] sdks 디렉터리 삭제 후 `pnpm pulumi:install`만으로 SDK 재생성
- [x] 재생성 후 `pnpm i`·`@common/bridged-provider` build 성공
- [x] PR validate 워크플로에 Setup Pulumi + `pulumi:install`이 `pnpm i`보다 앞
- [x] DevContainer sync가 `pulumi:install`을 첫 `pnpm i`보다 앞

## 범위 밖

- provider 버전 bump 자체
- infra 스택 `Pulumi.yaml` / `Pulumi.*.yaml`을 git에 올리는 일
- `pnpm projen` defaultTask에서 `pulumi:install` 네트워크 의존을 완전 제거하는 일 (기존 동작 유지)

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-11-12 | 등록. 접근 A 채택. 구현 착수 |
| 2026-11-12 | gitignore·Pulumi.yaml 추적·CI/sync 순서 수정. sdks `git rm --cached`. 삭제 후 `pnpm pulumi:install` → `pnpm i` → build 통과 |
| 2026-11-12 | 해결. sdks는 gitignore 생성물, cold path는 `pulumi:install` 선행 |
