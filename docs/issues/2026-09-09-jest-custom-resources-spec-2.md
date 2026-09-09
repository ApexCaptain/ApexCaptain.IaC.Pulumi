# Jest Spec 2 — custom-resources 나머지

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-09 |
| **영역** | `@common/custom-resources` 테스트 |
| **관련 코드** | `common/custom-resources/src`, `common/custom-resources/test/pulumi-mocks.ts` |
| **선행** | [Jest Spec 1](./2026-09-08-jest-unit-test-setup.md) |
| **상태** | **적용** — Spec 2 구현·수용 기준 검증 완료 |

## 배경

Spec 1이 Jest 배선, utils 전부, mock harness, 샘플 3개(`TextFileV1`, `PrivateKeyV1`, `VirtualServiceV1`)를 끝냈다. 남은 custom-resources `src`를 같은 하네스로 고정한다.

## 현재 상태

- `pnpm --filter @common/custom-resources test`: 샘플 3개.
- `installPulumiMocks` / `unwrap`(5s timeout, `stateOverrides`) 이미 있음.
- 라이브 클러스터·Vault·Authentik 호출은 테스트에서 금지.

## 목표

1. 남은 CRD wrapper의 `apiVersion`/`kind`를 테이블 테스트로 고정.
2. 로직 있는 리소스·컴포넌트는 파일별 mock 테스트.
3. 프로덕션 `src` 변경 없음.

## 접근 비교

| 방식 | 요지 |
|---|---|
| **A. CRD 한 테이블 + fat 파일별** | 파일 수 적음. VS 샘플과 중복 없음 |
| B. 벤더별 CRD 파일 | 헬퍼 중복 |
| C. CRD도 파일당 1개 | 파일 폭증 |

**추천·채택:** A.

## 아키텍처

- Projen/Jest 추가 배선 없음.
- `setMocks`는 각 테스트 파일이 `installPulumiMocks`로. CRD 테이블 파일은 모듈 상단 한 번.
- 기존 `virtual-service-v1.test.ts`는 유지. 테이블에 VirtualService 행 넣지 않음.
- Command(`AdminApiTokenV1`, `BootstrapTokenV1`): mock inputs의 create 문자열에 스크립트 파일명만. exec 안 함.
- `getPolcyExpressionV1`: `jest.mock('axios')`. `isDryRun()`은 mock `preview=false`라 HTTP 분기를 탄다. axios가 지정 URL·Bearer로 호출되고 결과 `name` 매칭을 반환하는지.
- `SecretV1Component`: kubernetes/vault/authentik Provider는 최소 mock. 자식 리소스 type이 몇 개 생기는지만. 전체 그래프 비비교.
- `SftpV1Component`: `Component:adapter:sftp:v1`. `PrivateKeyV1`과 같이 `PULUMI_CONTRACT_KEYS_DIR_PATH` tmp stub.
- `KubeConfigFileV1`: TextFile create 내용이 kubeconfig YAML(`apiVersion: v1`, `kind: Config`)인지. 디스크 쓰기 없음.

## 파일

`common/custom-resources/test/`에 추가:

| 파일 | 대상 |
|---|---|
| `crd-wrappers.test.ts` | 아래 16 CRD (VS 제외) |
| `sftp-v1.test.ts` | `SftpV1Component` |
| `secret-v1.test.ts` | `SecretV1Component` |
| `kube-config-file-v1.test.ts` | `KubeConfigFileV1` |
| `admin-api-token-v1.test.ts` | `AdminApiTokenV1` |
| `bootstrap-token-v1.test.ts` | `BootstrapTokenV1` |
| `get-policy-expression-v1.test.ts` | `getPolcyExpressionV1` |

### CRD 테이블

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
| `NodeV1Patch` | `longhorn.io/v1beta2` | `Node` |

각 행: 해당 class를 최소 필수 args로 `new`하고 `unwrap(urn)` 후 mock `inputs.apiVersion`/`kind`가 표와 같음. args는 타입을 통과하는 최소값(implementation plan에 구체값).

## 테스트 규칙

- characterization. src와 다르면 테스트를 고친다.
- 라이브 axios/kubectl/vault 금지.
- `parseBootstrapTokenStdout`을 export하지 않음.
- Mocha/CI/coverage 강제 없음.

## 수용 기준

- [x] `pnpm --filter @common/custom-resources test` 초록 (기존 3 + Spec 2)
- [x] `pnpm --filter @common/utils test` 회귀 없음
- [x] CRD 16 kind가 테이블에 있고 각각 PASS
- [x] fat 6파일 PASS
- [x] 프로덕션 `src` diff 없음

## 범위 밖

- GitHub Actions.
- VirtualService 테스트를 테이블로 이사.
- `parseBootstrapTokenStdout` / bootstrap 스크립트 본문 유닛.
- infra 스택 Jest.
- SecretV1의 모든 자식 필드 스냅샷.

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-09 | 등록. 설계 승인 (CRD 테이블 + fat 6파일, harness 재사용) |
| 2026-09-09 | implementation plan: [2026-09-09-jest-custom-resources-spec-2-plan.md](./2026-09-09-jest-custom-resources-spec-2-plan.md) |
| 2026-09-09 | Spec 2 구현. CRD 16 + fat 6 mock 테스트 초록. src 변경 없음 |
