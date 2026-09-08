# Jest 유닛 테스트 도입 (Spec 1)

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-08 |
| **영역** | `@common/utils`, `@common/custom-resources`, `.projenrc.ts` |
| **관련 코드** | `common/utils/src/functions`, `common/custom-resources/src`, `.projenrc.ts` `inflateCommonProject` |
| **상태** | **적용** — Spec 1 구현·수용 기준 검증 완료. Spec 2 미착수 |
| **후속** | Spec 2: 남은 `custom-resources` 전부 (이 문서 범위 밖, 별도 이슈) |

## 배경

Projen `TypeScriptProject`가 패키지마다 `test/`와 `test/tsconfig.json`을 이미 만들고, ESLint `env.jest`도 켜져 있다. `sharedProjectOption.jest`가 `false`라 `projen test`는 eslint만 돈다. turbo `test` task는 있으나 GitHub Actions 테스트 잡은 없다.

순수 유틸(`kebabCase`, Argo CD/OCI policy CSV, file mode 등)과 `defineComponent`/CRD wrapper를 회귀 없이 고치려면 in-process 테스트가 필요하다. 스택 배포 검증은 기존 `pulumi preview`가 맡는다.

## 현재 상태

- 루트·모든 워크스페이스 패키지: `jest: false`.
- `pnpm test` = eslint. 테스트 파일 없음 (`*.test.ts` / `*.spec.ts` 0개).
- `infra/k8s-workstation-tools/assets/coder/sysbox-ubuntu/test/`는 Coder 템플릿이지 Jest 디렉터리가 아니다.
- `.gitignore`가 `docs/superpowers`를 무시하므로 superpowers 기본 경로에 spec을 두면 커밋되지 않는다. 이 레포 SSOT는 `docs/issues`.

## 목표

Spec 1에서:

1. Projen으로 `@common/utils`와 `@common/custom-resources`에만 Jest를 켠다.
2. utils 순수 함수를 characterization 테스트로 고정한다.
3. Pulumi `setMocks` + `unwrap` 헬퍼를 `custom-resources/test`에 두고, 패턴 증명 샘플 3개를 통과시킨다.
4. 루트·infra 패키지에는 Jest 의존성을 넣지 않는다.

Spec 2(별도 이슈)에서 남은 custom-resources를 같은 harness로 채운다. 최종 목표는 custom-resources `src` 전부이나, 한 plan에 넣지 않는다.

## 접근 비교

| 방식 | 요지 | 단점 |
|---|---|---|
| **A. Projen opt-in** | `inflateCommonProject({ jest: true })`만 utils·custom-resources | 패키지마다 jest 의존성. 허용 |
| B. 루트 단일 Jest | 루트가 `common/**/test`를 수집 | Projen 워크스페이스 모델과 어긋남 |
| C. 손수 `jest.config.json` | `jest: false` 유지 | 다음 `projen` synth와 충돌 |

**추천:** A.

## 아키텍처

- 루트 `sharedProjectOption.jest`는 `false` 유지.
- `inflateCommonProject`에 `jest?: boolean`. `true`일 때만 해당 패키지 `jest: true`.
- `jestOptions.jestConfig`:
  - `testMatch`: `['**/test/**/*.test.ts']`
  - `passWithNoTests`: `true`
- 테스트 파일은 패키지 `test/*.test.ts`만. `src` 옆 `*.test.ts` 금지 (`rootDir: src`).
- 루트 스크립트 `test:workspaces`: `turbo run test --filter "./common/*"`.
- turbo `test.dependsOn`: `['build']` → `['^build']`. projen `test`가 compile 이후라 패키지 안 이중 build를 줄인다.
- GitHub Actions 없음. 게이트는 로컬 `pnpm --filter @common/utils test`와 `@common/custom-resources test`.
- projen `build`가 `test`를 spawn하므로, Jest ON 패키지는 테스트 실패 시 build 실패.

## 파일 배치

### `.projenrc.ts`

- `inflateCommonProject` option에 `jest?: boolean` 전달 → `TypeScriptProject`.
- `utilsProject`, `customResourcesProject`에 `jest: true`.
- 루트 `addScripts`에 `test:workspaces`.
- `turbo.json` tasks.test.dependsOn을 `['^build']`로.

### `common/utils/test/`

| 파일 | 대상 |
|---|---|
| `kebab-case.test.ts` | `kebabCase`, `k8s` 보존 |
| `is-valid-file-mode-string.test.ts` | octal / symbolic / 빈 문자열 |
| `create-argo-cd-policy-csv.test.ts` | permission·binding·csv, invalid throw |
| `create-oci-policy-statement.test.ts` | group/tenancy/condition, invalid throw |
| `merge-customizer.test.ts` | 배열 uniq+sort, 비배열은 `undefined` |
| `to-cloudflare-record-fqdn.test.ts` | `'@'` / zone / subdomain / 이미 FQDN. Output은 `unwrap` |
| `create-expiration-interval.test.ts` | `jest.useFakeTimers`로 `Date.now` 고정 |
| `wait-for-ms.test.ts` | fake timers. 실시간 sleep 금지 |
| `resolve-referenced-stack-stage.test.ts` | tmp fixture `Pulumi.{stage}.yaml` |
| `define-component.test.ts` | `setMocks` 후 최소 `ComponentResource`. 타입 문자열 `Component:${type}`. `@common/utils`는 custom-resources를 의존하지 않으므로 `pulumi-mocks.ts`를 import하지 않고 테스트 파일에서 직접 `setMocks` |

### `common/custom-resources/test/`

| 파일 | 대상 |
|---|---|
| `pulumi-mocks.ts` | `setMocks` + `unwrap<T>(output): Promise<T>`. Spec 2 재사용 |
| `text-file-v1.test.ts` | mock `newResource` inputs에서 `chmod`/fileMode. 디스크 쓰기 없음 |
| `private-key-v1.test.ts` | 타입 `tls:privateKey:v1`, algorithm ED25519. `createKeyFile: false` |
| `virtual-service-v1.test.ts` | mock args에 Istio `apiVersion`/`kind` 전달 |

생성 파일(`jest.config.json`, package.json deps)은 `pnpm exec projen`이 만든다. 손으로 커밋·편집하지 않는다.

## 테스트 규칙

- 기존 구현을 바꾸지 않는다. 테스트가 현재 동작과 다르면 테스트를 고친다 (characterization).
- Pulumi: `setMocks`를 모듈 import보다 먼저. 컴포넌트/리소스는 `await import(...)`.
- `Output`은 `unwrap`으로 `Promise`화. 생성자 직후 필드 assert 금지.
- Zod 빌더: 정상 출력 + invalid input `throw`.
- `TextFileV1`: `fs.existsSync`가 없는 경로를 가정. 해시 분기(`content` 해시 또는 `initial-deployment`)만 허용. assert는 mock inputs.
- `PrivateKeyV1`: Spec 1은 `createKeyFile: false`. `PULUMI_CONTRACT_KEYS_DIR_PATH` apply 경로를 타지 않게 한다.
- Mocha 도입 금지. 라이브 클러스터·Vault·Cloudflare 호출 금지.

## 수용 기준

- [x] `pnpm exec projen` 후 `@common/utils`, `@common/custom-resources`의 `package.json`에 `jest`, `ts-jest`, `@types/jest`
- [x] 루트·`@infra/*` `package.json`에 jest 의존성 없음
- [x] `pnpm --filter @common/utils test` 초록
- [x] `pnpm --filter @common/custom-resources test` 초록
- [x] `pnpm --filter @infra/k8s-workstation-tools test`는 기존처럼 eslint만. Coder `assets/.../test` JS를 Jest가 실행하지 않음
- [x] 프로덕션 `src` 동작 변경 없음 (테스트·Projen 배선만)

## 범위 밖

- GitHub Actions test workflow (원하면 후속 이슈).
- coverage 수치 강제.
- Spec 2: 남은 component (`SecretV1`, `SftpV1` 등)와 CRD wrapper 전부.
- `waitForMs` 실시간 타이머.
- infra 스택 Jest / Automation API 통합 테스트.
- `docs/superpowers` 경로 사용 (gitignore).

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-08 | 등록. Spec 1 설계 승인 (Projen opt-in, utils 전부 + mock harness + 샘플 3). Spec 2는 별도 |
| 2026-09-08 | implementation plan: [2026-09-08-jest-unit-test-setup-plan.md](./2026-09-08-jest-unit-test-setup-plan.md) |
| 2026-09-08 | Spec 1 구현. utils·custom-resources Jest 초록. Spec 2는 미착수 |
