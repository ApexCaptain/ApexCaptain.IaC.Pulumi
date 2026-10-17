# nexus 오류 처리·env 검증 부실, workflow action 고정 방식 불일치

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-17 |
| **우선순위** | 낮음 (수정 쉬움) |
| **영역** | `common/nexus`, `projenrc/workflows` |
| **관련 코드** | `common/nexus/src/abstract/esc.abstract.ts:57`, `common/nexus/src/classes/contract.ts:58`, `projenrc/workflows/pr-validation.ts` |
| **상태** | **조사중** |

## 증상

1. `esc.abstract.ts:57` — `createEnvironment`의 `catch (error) {}`가 "이미 존재(409)" 뿐 아니라 인증 실패·네트워크 오류·잘못된 org도 삼킨다. 이어지는 `updateEnvironment`가 원인과 무관해 보이는 에러로 실패한다.
2. `contract.ts:58` — `process.env.PULUMI_CONTRACT_HASH_DIR_PATH!!`. env가 없으면 `path.join`이 `TypeError [ERR_INVALID_ARG_TYPE]`를 던져 원인을 알기 어렵다. devcontainer 밖(CI 등)에서 실행 시 바로 걸린다.
3. `pr-validation.yml`은 `actions/checkout@v4`·`actions/setup-node@v4`를 태그로, `upgrade-develop.yml`은 SHA로 고정한다. public 레포에서 태그 고정은 공급망 위험.

## 조치 방향

1. 409(또는 SDK의 "already exists" 판별)만 무시하고 나머지는 rethrow
2. 생성자에서 env 존재 검사, 없으면 변수 이름과 설정 위치(`.devcontainer/commands/initializeCommand.sh`)를 담은 Error
3. projen workflow 정의에서 모든 action을 SHA + 버전 주석으로 고정

## 수용 기준

- [ ] `common/nexus/test/esc.test.ts`에 "409는 무시, 401/네트워크 오류는 throw" 케이스 추가·통과
- [ ] `common/nexus/test/contract.test.ts`에 env 누락 시 명확한 메시지 케이스 추가·통과
- [ ] `.github/workflows/*.yml` 전 action이 SHA 고정 (`pnpm projen` 생성물)
- [ ] `pnpm test:workspaces`, `pnpm eslint` 통과

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-17 | 등록. 프로젝트 평가에서 도출 |
