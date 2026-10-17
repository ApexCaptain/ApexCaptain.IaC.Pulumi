# nexus 오류 처리·env 검증 부실, workflow action 고정 방식 불일치

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-17 |
| **우선순위** | 낮음 (수정 쉬움) |
| **영역** | `common/nexus`, `projenrc/workflows` |
| **관련 코드** | `common/nexus/src/abstract/esc.abstract.ts:57`, `common/nexus/src/classes/contract.ts:58`, `projenrc/workflows/pr-validation.ts` |
| **상태** | **적용** — 코드·테스트 반영, 커밋·머지 대기 |

## 증상

1. `esc.abstract.ts:57` — `createEnvironment`의 `catch (error) {}`가 "이미 존재(409)" 뿐 아니라 인증 실패·네트워크 오류·잘못된 org도 삼킨다. 이어지는 `updateEnvironment`가 원인과 무관해 보이는 에러로 실패한다.
2. `contract.ts:58` — `process.env.PULUMI_CONTRACT_HASH_DIR_PATH!!`. env가 없으면 `path.join`이 `TypeError [ERR_INVALID_ARG_TYPE]`를 던져 원인을 알기 어렵다. devcontainer 밖(CI 등)에서 실행 시 바로 걸린다.
3. `pr-validation.yml`은 `actions/checkout@v4`·`actions/setup-node@v4`를 태그로, `upgrade-develop.yml`은 SHA로 고정한다. public 레포에서 태그 고정은 공급망 위험.

## 조치 방향

1. 409(또는 SDK의 "already exists" 판별)만 무시하고 나머지는 rethrow
2. 생성자에서 env 존재 검사, 없으면 변수 이름과 설정 위치(`.devcontainer/commands/initializeCommand.sh`)를 담은 Error
3. projen workflow 정의에서 모든 action을 SHA + 버전 주석으로 고정

## 조사

- `@pulumi/esc-sdk` 0.14.0 `createEnvironment`는 raw axios 호출. 2xx 외 응답은 `AxiosError`로 reject, `error.response.status`에 코드가 있다
- 실측 (2026-10-17): 이미 있는 `ApexCaptain/k8s-workstation-tools/dev`에 create → `409` `Conflict: a environment with name "k8s-workstation-tools/dev" already exists`. 잘못된 토큰 → `401`. 기존 코드는 둘 다 삼켰다
- 증상 3 보정: `upgrade-develop.yml`도 전부 SHA가 아니었다. `pnpm/action-setup@v6.0.10`, `peter-evans/create-pull-request@v8.1.1`이 태그. 둘 다 projen `ActionRefs` 기본값(“immutable” 태그)에서 온다
- projen `GithubWorkflow`는 모든 step `uses`를 `github.actions.get()`으로 해석한다. `github.actions.set(<action>, <action>@<sha>)` 한 곳으로 전 workflow를 덮을 수 있다
- projen은 `uses` 문자열만 출력하므로 YAML 버전 주석은 넣을 수 없다. 버전은 `projenrc/workflows/action-pins.ts`의 TS 주석에 둔다

## 조치

1. `common/nexus/src/abstract/esc.abstract.ts` — `response.status === 409`만 무시, 나머지 rethrow
2. `common/nexus/src/classes/contract.ts` — env 없으면 `PULUMI_CONTRACT_HASH_DIR_PATH is not set (defined in .devcontainer/commands/initializeCommand.sh)` throw
3. `projenrc/workflows/action-pins.ts` 신설 (`.projenrc.ts`에서 호출) — `actions/setup-node` v7.0.0, `pnpm/action-setup` v6.0.10, `peter-evans/create-pull-request` v8.1.1을 commit SHA로 override (`git ls-remote`로 조회, annotated tag는 `^{}` commit)
4. `projenrc/workflows/pr-validation.ts` — 하드코딩 태그 대신 projen `ActionRefs` 사용. 결과적으로 `actions/checkout` v4 → v7.0.1(SHA, upgrade workflow와 동일), `actions/setup-node` v4 → v7.0.0. 첫 PR CI에서 정상 동작 확인 필요

## 수용 기준

- [x] `common/nexus/test/esc.test.ts`에 "409는 무시, 401/네트워크 오류는 throw" 케이스 추가·통과
- [x] `common/nexus/test/contract.test.ts`에 env 누락 시 명확한 메시지 케이스 추가·통과
- [x] `.github/workflows/*.yml` 전 action이 SHA 고정 (`pnpm projen` 생성물)
- [x] `pnpm test:workspaces`, `pnpm eslint` 통과

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-17 | 등록. 프로젝트 평가에서 도출 |
| 2026-10-17 | ESC 409/401 실측, 3건 조치. nexus 테스트 8 → 12, `pnpm test:workspaces`·`pnpm eslint` 통과. 상태 적용 |
