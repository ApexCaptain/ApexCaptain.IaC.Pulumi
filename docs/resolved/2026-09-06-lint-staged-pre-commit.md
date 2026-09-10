# lint-staged 도입 (pre-commit 전량 lint 제거)

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-09-06 |
| **영역** | 개발자 경험 / Git hooks / 코드 품질 |
| **관련 코드** | `.projenrc.ts` (Husky 훅 생성), `src/functions/generate-husky-hooks.function.ts`, `.husky/pre-commit` |
| **상태** | **해결** |
| **해결일** | 2026-09-06 |

---

## 배경

커밋마다 저장소 전체를 린트·재생성하고 있다. 모노레포가 커지면서 pre-commit이 느려지고, `git add .` 때문에 스테이징하지 않은 파일까지 커밋에 섞인다.

**lint-staged**로 스테이징된 파일만 ESLint를 돌리도록 바꾸고 싶다.

---

## 현재 상태 (2026-09-06)

### pre-commit (Husky)

`.projenrc.ts`의 `generateHuskyHooks`가 `.husky/pre-commit`을 생성한다. 실제 훅 본문:

```sh
if ! command -v pnpm >/dev/null 2>&1; then
  exit 0
fi

pnpm projen
pnpm eslint
git add .
```

동작 순서:

1. **`pnpm projen`** — 생성 파일 전체 재작성 (package.json, eslintrc, turbo.json, 워크스페이스 매니페스트 등)
2. **`pnpm eslint`** — 루트 `src` / `scripts` / `projenrc` / `.projenrc.ts`를 `--fix`로 린트
3. **`posteslint`** — `turbo run eslint --filter "./common/*" --filter "./infra/*"` 로 **워크스페이스 8개 전부** 린트 (`common/{bridged-provider,custom-resources,nexus,utils}`, `infra/{cloudflare,k8s-workstation-apps,k8s-workstation-system,k8s-workstation-tools}`)
4. **`git add .`** — 워킹트리 변경·미추적 파일을 전부 스테이징

### Husky 설치

- `husky`는 **package.json 의존성이 아니다.**
- Devcontainer `synchronizeProject.sh`가 `npx -y husky`로 `.husky/_/` 를 맞춘다.
- 훅 파일 자체는 `generateHuskyHooks`가 매 `projen`마다 덮어쓴다. `.husky/_/` 디렉터리는 건드리지 않는다.
- Husky v9 스타일: 훅 파일에 `husky.sh` source가 없고, `.husky/_/h`가 `node_modules/.bin`을 PATH에 넣은 뒤 훅 본문을 실행한다.

### 린트 도구 배치

| 위치 | 포맷터 | ESLint 9 설정 | 실행 엔트리 |
|------|--------|---------------|-------------|
| 루트 | Prettier (`eslint-plugin-prettier`) | `.eslintrc.json`, `root: true` | `projen eslint` → `src scripts projenrc .projenrc.ts` |
| 워크스페이스 | `@stylistic` (Prettier 없음) | 패키지별 `.eslintrc.json`, `root: true` | `turbo run eslint` → 각 패키지 `src test build-tools` |

루트·워크스페이스 모두 `ESLINT_USE_FLAT_CONFIG=false` 가 있어야 ESLint 9가 eslintrc를 읽는다. 이 env는 **projen eslint task에만** 들어 있다. `eslint` 바이너리를 그냥 치면 flat config를 찾다가 실패할 수 있다.

### CI

`.github/workflows/pull-request-lint.yml`은 **PR 제목 semantic check만** 한다. 원격에서 전량 ESLint를 돌리는 워크플로는 없다. 지금 품질 게이트는 사실상 **로컬 pre-commit**과 `pnpm build`(eslint spawn)뿐이다.

### 규모 (대략)

- 루트 `src/` ~13 TS, `scripts/` ~15 TS
- `infra/` 애플리케이션 TS ~100
- `common/` 는 자체 소스 + `bridged-provider/sdks/` 생성물까지 합치면 TS가 훨씬 많음. 워크스페이스 eslint dirs는 `src`/`test`/`build-tools`라서 **평소 `pnpm eslint`는 SDK를 안 돌린다.** 다만 스테이징된 경로를 eslint에 넘기면 ignore하지 않는 한 SDK도 린트 대상이 된다.

---

## 문제

1. **매 커밋이 전량 린트.** 한 파일만 고쳐도 루트 + 워크스페이스 8패키지 ESLint가 돈다. `posteslint` concurrency=3이어도 체감이 크다.
2. **`git add .`가 스테이징 의도를 무시한다.** 부분 스테이징, 로컬 WIP, projen이 다시 쓴 무관 파일, 실수로 워킹트리에 남은 파일이 같은 커밋에 들어간다. gitignore 밖 비밀 파일이 있으면 훅이 그대로 add 한다.
3. **부분 스테이징 + `--fix`가 충돌한다.** 전량 eslint `--fix`는 파일 전체를 고친 뒤 `git add .`로 unstaged hunk까지 커밋에 넣는다. lint-staged는 unstaged 변경을 잠시 치우고 staged hunk만 고친다.
4. **`pnpm eslint -- <files>`로는 staged-only가 안 된다.** projen eslint는 고정 dirs 뒤에 인자를 붙인다 (`receiveArgs: true`). 파일을 넘겨도 `src scripts …` 전체가 그대로 린트된다. 훅에서 `pnpm eslint`를 호출하는 한 staged-only는 불가능하다.
5. **항상 `pnpm projen`.** `.projenrc.ts`를 안 건드린 커밋에도 생성 파일이 다시 쓰이고, `git add .`가 그 차이를 커밋에 실어 나른다.

---

## 목표

- pre-commit은 **staged TypeScript만** ESLint `--fix` 한다.
- 린트가 고친 파일만 다시 스테이징한다. **`git add .` 금지.**
- 패키지별 eslintrc(Prettier vs `@stylistic`)는 그대로 쓴다. 설정 통일은 이 이슈 범위가 아니다.
- 전량 린트 명령(`pnpm eslint` + `posteslint`)은 수동/빌드용으로 남긴다.
- 설정 SSOT는 `.projenrc.ts`다. `package.json` / 훅 파일을 손으로 고치지 않는다.

---

## 접근 비교

| 옵션 | 요지 | 장점 | 단점 |
|------|------|------|------|
| **A. 루트 lint-staged + 기존 generateHuskyHooks** | 루트에 `lint-staged` 추가. pre-commit을 `pnpm exec lint-staged`로 교체 | 지금 훅 생성 경로를 유지. 구현 작음. eslint가 파일 디렉터리부터 eslintrc를 찾으므로 패키지 `root: true`가 그대로 동작 | 패키지별 lint-staged 설정은 없음 (이 레포에는 보통 필요 없음) |
| B. 패키지마다 `.lintstagedrc` | lint-staged가 가장 가까운 설정을 cwd로 씀 | 패키지 격리 | 루트 `src/`·`.projenrc.ts`용 설정을 또 둬야 함. 가까운 설정에 안 맞으면 **무시**. 관리 포인트만 늘어남 |
| C. turbo `--filter` affected + 패키지 전량 eslint | 변경된 패키지 단위로 기존 `pnpm eslint` | task 재사용 | 패키지 한 파일만 바꿔도 그 패키지 전체 린트. staged hunk / `git add .` 문제는 그대로. **lint-staged가 아님** |

**추천: A.**

lint-staged 문서도 모노레포에서 루트 설치 + (필요 시) 패키지별 설정을 허용하지만, 이 레포는 훅이 루트 하나이고 eslint가 이미 가장 가까운 `.eslintrc.json`을 고른다. 루트 설정 하나가 맞다.

---

## 추천 설계 (A)

### 1. 의존성

루트 `devDeps`에 `lint-staged`를 추가한다 (`.projenrc.ts` → `rootProject` `devDeps`).

`husky` 패키지화·`prepare: husky` 도입은 **하지 않는다.** 지금 `npx husky` + `generateHuskyHooks`로 훅이 동작한다. lint-staged 바이너리만 `node_modules/.bin`에 있으면 된다 (Husky `_/h`가 그 PATH를 넣음).

### 2. pre-commit

`generateHuskyHooks`의 `pre-commit`을 아래로 교체한다.

```sh
if ! command -v pnpm >/dev/null 2>&1; then
  exit 0
fi

pnpm exec lint-staged
```

- `pnpm projen` 제거 — `.projenrc.ts`를 바꾼 뒤에는 개발자가 기존처럼 `pnpm projen`을 실행한다. 훅이 매 커밋마다 생성물을 다시 쓰고 `git add .` 하던 부작용을 없앤다.
- `pnpm eslint` / `posteslint` 제거
- `git add .` 제거

### 3. lint-staged 설정

`package.json`의 `lint-staged` 필드 (`rootProject.package.addField`) 또는 projen이 관리하는 `lint-staged.config.mjs`. JSON으로 충분하면 필드를 우선한다.

의도하는 매처:

```json
{
  "*.{ts,tsx}": "ESLINT_USE_FLAT_CONFIG=false NODE_NO_WARNINGS=1 eslint --fix --no-error-on-unmatched-pattern --ignore-pattern **/sdks/** --ignore-pattern **/node_modules/** --ignore-pattern **/lib/**"
}
```

| 결정 | 이유 |
|------|------|
| `pnpm eslint`가 아니라 **eslint 바이너리** | projen task는 dirs를 항상 린트해서 staged-only가 안 됨 |
| `ESLINT_USE_FLAT_CONFIG=false` | ESLint 9 + eslintrc. 빼면 flat config 탐색으로 실패 |
| 루트 한 줄 glob | 파일 경로 기준으로 패키지 `.eslintrc.json` (`root: true`) 선택. 루트는 Prettier, 워크스페이스는 `@stylistic` |
| `--ignore-pattern **/sdks/**` | `common/bridged-provider/sdks/` 생성 TS가 staged여도 린트하지 않음. 기존 `pnpm eslint` dirs와 맞춤 |
| JSON/MD/YAML Prettier | **v1 제외.** 루트만 Prettier가 있고 워크스페이스는 `@stylistic`. 포맷 범위를 넓히면 이 이슈와 별개 |

환경 변수를 JSON 한 줄에 넣기 어렵거나 Windows를 염두에 두면 `lint-staged.config.mjs` + `env`를 쓴다. 이 워크스페이스는 Linux/devcontainer가 기준이므로 한 줄 커맨드로 시작한다.

### 4. 전량 린트는 유지

```bash
pnpm eslint          # 루트 + posteslint(워크스페이스)
```

빌드(`projen build` → eslint spawn)도 그대로 둔다. pre-commit을 줄여도 전량 검사는 명령 한 번으로 가능하다.

---

## 구현 시 주의

1. **생성 파일은 `.projenrc.ts`만 수정.** `package.json`, `.husky/pre-commit`을 직접 고치면 다음 `pnpm projen`이 덮어쓴다.
2. **`generateHuskyHooks`는 `.husky/` 안의 일반 파일을 지우고 다시 쓴다.** `_/` 디렉터리는 유지된다. 훅 본문에 shebang/`husky.sh` source를 넣지 않는다 (현재 v9 형식 유지).
3. lint-staged는 기본적으로 **명령에 넘긴 파일만** 다시 stage 한다. `pnpm projen`처럼 사이드이펙트로 생긴 파일은 자동 add 되지 않는다. 그래서 v1에서 훅의 `pnpm projen`을 뺀다.
4. 부분 스테이징: lint-staged가 unstaged를 숨겼다가 복구한다. 기존 `eslint --fix` + `git add .`보다 안전하다.
5. `docs/issues`, ansible, kubespray third_party는 glob이 `*.{ts,tsx}`라서 훅 대상이 아니다.

---

## 범위 밖 (후속 이슈 후보)

| 항목 | 이유 |
|------|------|
| `post-commit`의 `git push` | lint-staged와 무관. 실패해도 커밋은 이미 생성된 공격적 훅 |
| `husky`를 package.json `prepare`로 정식 의존성화 | 현재 `npx husky`로 동작. 설치 경로 정리는 별건 |
| 루트 Prettier vs 워크스페이스 `@stylistic` 통일 | 동작에는 지장 없음. 큰 디프 |
| JSON/MD/YAML를 prettier로 포맷 | 루트에만 prettier 있음 |
| CI에서 ESLint job 추가 | 지금 PR CI는 제목만 검사. pre-commit을 줄이면 원격 전량 린트 공백이 더 드러남 — **별도 이슈로 다루는 편이 맞음** |
| `.projenrc.ts` staged 시에만 `pnpm projen` | 생성물 재-stage 목록이 `.projen/files.json` + 워크스페이스로 넓어 취약. v1에서 훅 밖으로 뺌 |

---

## 수용 기준

- [x] 루트 `devDependencies`에 `lint-staged`가 있고, 출처는 `.projenrc.ts`다.
- [x] `.husky/pre-commit`이 `pnpm exec lint-staged`만 실행한다 (`pnpm` 가드 유지). `pnpm projen` / `pnpm eslint` / `git add .`가 없다.
- [x] TS 한 파일만 stage 한 뒤 커밋하면 그 파일(과 eslint `--fix`가 고친 그 파일)만 검사·재stage 된다. 다른 패키지 전량 eslint는 돌지 않는다.
- [x] 스테이징하지 않은 워킹트리 파일은 커밋에 들어가지 않는다.
- [x] 루트 파일은 Prettier 기반 eslint, 워크스페이스 파일은 `@stylistic` 기반 eslint가 적용된다 (기존 eslintrc).
- [x] `common/bridged-provider/sdks/**` 는 훅에서 린트하지 않는다.
- [x] `pnpm eslint`로 전량 린트가 여전히 된다.
- [x] `pnpm projen` 후에도 훅·lint-staged 설정이 유지된다 (생성 파일 직접 수정 없음).

---

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-09-06 | 현재 훅·eslint·Husky 설치 경로 조사. lint-staged 루트 도입(옵션 A)으로 이슈 등록 |
| 2026-09-06 | `.projenrc.ts`에 `lint-staged` 추가, pre-commit을 staged TS eslint `--fix`로 교체. `git add .` / 매 커밋 `pnpm projen` 제거 |
| 2026-09-06 | 완료. `docs/issues/` → `docs/resolved/` 아카이브 |
| 2026-09-10 | 루트 cwd eslint가 패키지 `parserOptions.project`를 루트 `test/tsconfig.json`으로 해석. pre-commit 실패 (`none of those tsconfigs include this file`). lint-staged가 `scripts/lint-staged-eslint.script.ts`로 가장 가까운 `.eslintrc.json` cwd에서 상대 경로 eslint |
