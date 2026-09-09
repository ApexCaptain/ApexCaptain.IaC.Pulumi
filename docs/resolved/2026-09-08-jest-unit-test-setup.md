# Jest 유닛 테스트 도입 (Spec 1 + Spec 2)

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-08 |
| **해결일** | 2026-09-09 |
| **영역** | `@common/utils`, `@common/custom-resources`, `.projenrc.ts` |
| **관련 코드** | `common/utils/test`, `common/custom-resources/test`, `.projenrc.ts` `inflateCommonProject` |
| **상태** | **해결** — Spec 1·2 구현·수용 기준 충족. 이 레포에서 이 주제로 할 일 없음 |
| **원본** | `docs/issues/2026-09-08-jest-unit-test-setup.md` (+ plan), `docs/issues/2026-09-09-jest-custom-resources-spec-2.md` (+ plan). 2026-09-09 한 파일로 합쳐 아카이브 |

## 해결 요약

Projen opt-in으로 `@common/utils`와 `@common/custom-resources`에만 Jest를 켰다. utils 순수 함수 10 suite / 37 test, custom-resources 10 suite / 25 test (샘플 3 + CRD 16 + fat 6). 프로덕션 `src`는 바꾸지 않았다. 루트·infra는 Jest 의존성 없음.

실행:

```bash
pnpm --filter @common/utils test
pnpm --filter @common/custom-resources test
pnpm test:workspaces
```

루트 `pnpm test`는 Projen `test`라 eslint다. Jest가 아님.

생성 파일(`jest.config.json`, package.json Jest deps)은 `.projenrc.ts` 수정 후 `pnpm exec projen`. 손 편집 금지.

---

## 배경

Projen `TypeScriptProject`가 패키지마다 `test/`와 `test/tsconfig.json`을 이미 만들고, ESLint `env.jest`도 켜져 있다. `sharedProjectOption.jest`가 `false`라 `projen test`는 eslint만 돌았다. turbo `test` task는 있으나 GitHub Actions 테스트 잡은 없다.

순수 유틸과 `defineComponent`/CRD wrapper를 회귀 없이 고치려면 in-process 테스트가 필요하다. 스택 배포 검증은 기존 `pulumi preview`가 맡는다.

## 목표

Spec 1: Jest 배선, utils 전부, Pulumi mock harness, 샘플 3개.

Spec 2: 남은 custom-resources CRD 16 + fat 6. 같은 harness. 프로덕션 `src` 변경 없음.

## 접근 비교

### Spec 1 — Jest 도입

| 방식 | 요지 | 단점 |
|---|---|---|
| **A. Projen opt-in** | `inflateCommonProject({ jest: true })`만 utils·custom-resources | 패키지마다 jest 의존성. 허용 |
| B. 루트 단일 Jest | 루트가 `common/**/test`를 수집 | Projen 워크스페이스 모델과 어긋남 |
| C. 손수 `jest.config.json` | `jest: false` 유지 | 다음 `projen` synth와 충돌 |

**채택:** A.

### Spec 2 — 남은 custom-resources

| 방식 | 요지 |
|---|---|
| **A. CRD 한 테이블 + fat 파일별** | 파일 수 적음. VS 샘플과 중복 없음 |
| B. 벤더별 CRD 파일 | 헬퍼 중복 |
| C. CRD도 파일당 1개 | 파일 폭증 |

**채택:** A.

## 아키텍처

- 루트 `sharedProjectOption.jest`는 `false`. `inflateCommonProject({ jest: true })`만 두 패키지.
- `testMatch`: `**/test/**/*.test.ts`만. Projen 기본 `src/**` 글롭은 construct 후 덮어씀.
- 테스트는 패키지 `test/*.test.ts`. `src` 옆 `*.test.ts` 금지 (`rootDir: src`).
- turbo `test.dependsOn`: `['^build']`.
- Pulumi: `installPulumiMocks` / `unwrap`(`output.apply`, 5s timeout). `output.promise()` 없음. `setMocks` 후 dynamic `import()`.
- characterization: src와 다르면 테스트를 고친다.
- Mocha·GitHub Actions·라이브 클러스터/Vault/Authentik/Cloudflare 없음.
- `@common/utils`는 `@common/custom-resources`를 import하지 않음. `define-component.test.ts`는 자체 `setMocks`.

## 파일

### Spec 1

| 경로 | 역할 |
|---|---|
| `.projenrc.ts` | `inflateCommonProject` jest 옵션 |
| `common/utils/test/*.test.ts` | kebab-case, file-mode, argo/oci policy, merge-customizer, cloudflare FQDN, expiration, wait-for-ms, stack-stage, define-component |
| `common/custom-resources/test/pulumi-mocks.ts` | harness |
| `text-file-v1.test.ts` | chmod in create. 디스크 쓰기 없음 |
| `private-key-v1.test.ts` | ED25519, `createKeyFile: false`, `PULUMI_CONTRACT_KEYS_DIR_PATH` tmp stub |
| `virtual-service-v1.test.ts` | Istio `apiVersion`/`kind` |

### Spec 2 — `common/custom-resources/test/`

| 파일 | 대상 |
|---|---|
| `crd-wrappers.test.ts` | CRD 16 (VirtualService 제외) |
| `sftp-v1.test.ts` | `SftpV1Component` |
| `secret-v1.test.ts` | `SecretV1Component`. 자식 type/kind 존재만. `jest.mock('flat')` — `flat@6` ESM |
| `kube-config-file-v1.test.ts` | `KubeConfigFileV1`. 소스 필드명 `clustser` |
| `admin-api-token-v1.test.ts` | create 문자열에 `admin-api-token.v1.script.ts`. exec 없음 |
| `bootstrap-token-v1.test.ts` | create 문자열에 `bootstrap-token.v1.script.ts`. `parseBootstrapTokenStdout` 미export |
| `get-policy-expression-v1.test.ts` | `getPolcyExpressionV1`. `jest.mock('axios')` |

### CRD 테이블 (`crd-wrappers.test.ts`)

| Class | apiVersion | kind |
|---|---|---|
| `GatewayV1` | `networking.istio.io/v1beta1` | `Gateway` |
| `DestinationRuleV1` | `networking.istio.io/v1beta1` | `DestinationRule` |
| `ServiceEntryV1` | `networking.istio.io/v1beta1` | `ServiceEntry` |
| `EnvoyFilterV1Alpha3` | `networking.istio.io/v1alpha3` | `EnvoyFilter` |
| `AuthorizationPolicyV1` | `security.istio.io/v1` | `AuthorizationPolicy` |
| `PeerAuthenticationV1` | `security.istio.io/v1beta1` | `PeerAuthentication` |
| `LoadBalancerIpPoolV2` | `cilium.io/v2` | `CiliumLoadBalancerIPPool` |
| `L2AnnouncementPolicyV2Alpha1` | `cilium.io/v2alpha1` | `CiliumL2AnnouncementPolicy` |
| `CertificateV1` | `cert-manager.io/v1` | `Certificate` |
| `IssuerV1` | `cert-manager.io/v1` | `Issuer` |
| `ClusterIssuerV1` | `cert-manager.io/v1` | `ClusterIssuer` |
| `ClusterV1` | `postgresql.cnpg.io/v1` | `Cluster` |
| `VaultConnectionV1` | `secrets.hashicorp.com/v1beta1` | `VaultConnection` |
| `VaultAuthV1` | `secrets.hashicorp.com/v1beta1` | `VaultAuth` |
| `VaultStaticSecretV1` | `secrets.hashicorp.com/v1beta1` | `VaultStaticSecret` |
| `NodeV1Patch` | `longhorn.io/v1beta2` | `Node` (`CustomResourcePatch`) |

## 구현 plan (요약)

에이전트용 체크리스트 전문은 넣지 않는다. 수행 단위만.

Spec 1 (`test/jest-spec-1`, 이후 `develop` fast-forward):

1. Projen Jest opt-in
2–6. utils 테스트 파일
7. `pulumi-mocks.ts`
8–10. TextFile / PrivateKey / VirtualService
11. 수용 기준

Spec 2 (`test/jest-spec-2` → `develop` fast-forward):

1. CRD 테이블
2–7. fat 6파일
8. 수용 기준

함정: Projen이 `testMatch`에 src 글롭을 덧붙임. `unwrap`은 `apply`만. PrivateKey는 `createKeyFile: false`여도 env를 읽음. Coder `assets/.../test`는 Jest가 아님.

## 수용 기준

Spec 1:

- [x] `pnpm exec projen` 후 utils·custom-resources에 `jest`, `ts-jest`, `@types/jest`
- [x] 루트·`@infra/*`에 jest 의존성 없음
- [x] `pnpm --filter @common/utils test` 초록
- [x] `pnpm --filter @common/custom-resources test` 초록
- [x] `@infra/k8s-workstation-tools test`는 eslint만. Coder 템플릿 Jest 미실행
- [x] 프로덕션 `src` 동작 변경 없음

Spec 2:

- [x] custom-resources 전체 초록 (기존 3 + Spec 2)
- [x] utils 회귀 없음
- [x] CRD 16 kind PASS
- [x] fat 6파일 PASS
- [x] 프로덕션 `src` diff 없음

## 범위 밖 (후속 이슈로 분리)

- GitHub Actions test workflow.
- coverage 수치 강제.
- VirtualService를 CRD 테이블로 이사.
- `parseBootstrapTokenStdout` / bootstrap 스크립트 본문 유닛.
- infra 스택 Jest / Automation API.
- SecretV1 전체 자식 필드 스냅샷.
- Command stdout parse 경로 추가 assert.
- `docs/superpowers` 경로 (gitignore).

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-08 | 등록. Spec 1 설계 승인 (Projen opt-in, utils 전부 + mock harness + 샘플 3). Spec 2는 별도 |
| 2026-09-08 | Spec 1 implementation plan 작성 |
| 2026-09-08 | Spec 1 구현. utils·custom-resources Jest 초록. Spec 2는 미착수 |
| 2026-09-09 | Spec 2 착수. 설계 승인 (CRD 테이블 + fat 6파일, harness 재사용) |
| 2026-09-09 | Spec 2 implementation plan 작성 |
| 2026-09-09 | Spec 2 구현. CRD 16 + fat 6 mock 테스트 초록. src 변경 없음 |
| 2026-09-09 | 최종 리뷰: flat ESM mock 주석·현재 상태 절 갱신 |
| 2026-09-09 | 해결. Spec 1·2 문서·plan 네 파일을 이 문서로 합쳐 `docs/resolved` 아카이브 |
