# Jest Spec 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec 1 하네스로 `@common/custom-resources` 나머지 CRD 16개와 fat 리소스 6개를 characterization 테스트로 고정한다.

**Architecture:** Projen/Jest 추가 배선 없음. `installPulumiMocks` / `unwrap`만 재사용. CRD는 `test.each` 한 파일. fat은 파일당 하나. 프로덕션 `src`는 읽기만.

**Tech Stack:** 기존 Jest + ts-jest, Pulumi `runtime.setMocks`, `jest.mock('axios')` (policy expression만).

**Spec:** [2026-09-09-jest-custom-resources-spec-2.md](./2026-09-09-jest-custom-resources-spec-2.md)

## Global Constraints

- 프로덕션 `src` 동작 변경 금지. 테스트가 현재 구현과 다르면 테스트를 고친다.
- Jest 설정·deps를 손으로 쓰지 않는다. `.projenrc.ts` / `jest.config.json` / `package.json` Jest 필드를 이 스펙에서 건드리지 않는다.
- 테스트 파일은 `common/custom-resources/test/*.test.ts`만.
- 기존 `virtual-service-v1.test.ts`를 테이블로 이사하지 않는다. 테이블에 VirtualService 행을 넣지 않는다.
- Mocha 금지. GitHub Actions 금지. 라이브 axios/kubectl/vault/authentik 호출 금지.
- `parseBootstrapTokenStdout`을 export하지 않는다. bootstrap 스크립트 본문을 유닛 테스트하지 않는다.
- SecretV1 전체 자식 필드 스냅샷 금지. 자식 **type/kind 존재**만.
- `unwrap`은 `output.apply` + 5s timeout. `output.promise()` 쓰지 않는다.
- 커밋은 사용자가 이 세션에서 요청했을 때만. 요청 없으면 각 Task의 Commit 스텝을 건너뛴다.
- 작업 브랜치: `develop`에서 `test/jest-spec-2`를 딴다. `develop`에 직접 커밋하지 않는다.
- `.superpowers/**` 를 git add 하지 않는다.
- husky `--no-verify` 금지. 새 브랜치에 upstream이 없으면 post-commit push 실패는 무시한다.

## File structure

| 경로 | 역할 |
|---|---|
| `common/custom-resources/test/pulumi-mocks.ts` | 재사용만. 이 스펙에서 수정하지 않음 |
| Create: `common/custom-resources/test/crd-wrappers.test.ts` | CRD 16행 `test.each` |
| Create: `common/custom-resources/test/sftp-v1.test.ts` | `SftpV1Component` |
| Create: `common/custom-resources/test/secret-v1.test.ts` | `SecretV1Component` |
| Create: `common/custom-resources/test/kube-config-file-v1.test.ts` | `KubeConfigFileV1` |
| Create: `common/custom-resources/test/admin-api-token-v1.test.ts` | `AdminApiTokenV1` |
| Create: `common/custom-resources/test/bootstrap-token-v1.test.ts` | `BootstrapTokenV1` |
| Create: `common/custom-resources/test/get-policy-expression-v1.test.ts` | `getPolcyExpressionV1` |
| Do not modify: `common/custom-resources/src/**` | 프로덕션 |

---

### Task 1: CRD wrapper 테이블

**Files:**
- Create: `common/custom-resources/test/crd-wrappers.test.ts`
- Do not modify: `common/custom-resources/src/resources/k8s/crd/**`

**Interfaces:**
- Consumes: `installPulumiMocks`, `unwrap`
- Produces: 16 kind가 `test.each`로 PASS. 이후 Task는 이 파일을 수정하지 않음

- [ ] **Step 1: 테스트 작성**

`common/custom-resources/test/crd-wrappers.test.ts`:

```typescript
import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
});

type CrdCase = {
  className: string;
  modulePath: string;
  pulumiName: string;
  apiVersion: string;
  kind: string;
  args: Record<string, unknown>;
};

const cases: CrdCase[] = [
  {
    className: 'GatewayV1',
    modulePath: '../src/resources/k8s/crd/istio/gateway.v1.res',
    pulumiName: 'unit-gateway',
    apiVersion: 'networking.istio.io/v1beta1',
    kind: 'Gateway',
    args: {
      metadata: { name: 'unit-gateway', namespace: 'istio-system' },
      spec: {
        selector: { istio: 'ingressgateway' },
        servers: [
          {
            port: { number: 80, name: 'http', protocol: 'HTTP' },
            hosts: ['unit.example.com'],
          },
        ],
      },
    },
  },
  {
    className: 'DestinationRuleV1',
    modulePath: '../src/resources/k8s/crd/istio/destination-rule.v1.res',
    pulumiName: 'unit-destination-rule',
    apiVersion: 'networking.istio.io/v1beta1',
    kind: 'DestinationRule',
    args: {
      metadata: { name: 'unit-dr', namespace: 'media' },
      spec: { host: 'jellyfin.media.svc.cluster.local' },
    },
  },
  {
    className: 'ServiceEntryV1',
    modulePath: '../src/resources/k8s/crd/istio/service-entry.v1.res',
    pulumiName: 'unit-service-entry',
    apiVersion: 'networking.istio.io/v1beta1',
    kind: 'ServiceEntry',
    args: {
      metadata: { name: 'unit-se', namespace: 'istio-system' },
      spec: {
        hosts: ['example.com'],
        ports: [{ number: 443, name: 'https', protocol: 'HTTPS' }],
      },
    },
  },
  {
    className: 'EnvoyFilterV1Alpha3',
    modulePath: '../src/resources/k8s/crd/istio/envoy-filter.v1alpha3.res',
    pulumiName: 'unit-envoy-filter',
    apiVersion: 'networking.istio.io/v1alpha3',
    kind: 'EnvoyFilter',
    args: {
      metadata: { name: 'unit-ef', namespace: 'istio-system' },
      spec: {
        configPatches: [
          {
            applyTo: 'HTTP_FILTER',
            patch: {
              operation: 'INSERT_BEFORE',
              value: { name: 'unit-filter' },
            },
          },
        ],
      },
    },
  },
  {
    className: 'AuthorizationPolicyV1',
    modulePath:
      '../src/resources/k8s/crd/istio/authorization-policy.v1.res',
    pulumiName: 'unit-authz-policy',
    apiVersion: 'security.istio.io/v1',
    kind: 'AuthorizationPolicy',
    args: {
      metadata: { name: 'unit-authz', namespace: 'istio-system' },
      spec: {},
    },
  },
  {
    className: 'PeerAuthenticationV1',
    modulePath:
      '../src/resources/k8s/crd/istio/peer-authentication.v1.res',
    pulumiName: 'unit-peer-auth',
    apiVersion: 'security.istio.io/v1beta1',
    kind: 'PeerAuthentication',
    args: {
      metadata: { name: 'unit-peer-auth' },
    },
  },
  {
    className: 'LoadBalancerIpPoolV2',
    modulePath:
      '../src/resources/k8s/crd/cilium/load-balancer-ip-pool.v2.res',
    pulumiName: 'unit-lb-pool',
    apiVersion: 'cilium.io/v2',
    kind: 'CiliumLoadBalancerIPPool',
    args: {
      metadata: { name: 'unit-lb-pool' },
      spec: {},
    },
  },
  {
    className: 'L2AnnouncementPolicyV2Alpha1',
    modulePath:
      '../src/resources/k8s/crd/cilium/l2-announcement-policy.v2alpha1.res',
    pulumiName: 'unit-l2-announce',
    apiVersion: 'cilium.io/v2alpha1',
    kind: 'CiliumL2AnnouncementPolicy',
    args: {
      metadata: { name: 'unit-l2' },
      spec: {},
    },
  },
  {
    className: 'CertificateV1',
    modulePath:
      '../src/resources/k8s/crd/cert-manager/certificate.v1.res',
    pulumiName: 'unit-certificate',
    apiVersion: 'cert-manager.io/v1',
    kind: 'Certificate',
    args: {
      metadata: { name: 'unit-cert', namespace: 'cert-manager' },
      spec: {
        secretName: 'unit-cert-tls',
        issuerRef: { name: 'unit-issuer', kind: 'Issuer' },
      },
    },
  },
  {
    className: 'IssuerV1',
    modulePath: '../src/resources/k8s/crd/cert-manager/issuer.v1.res',
    pulumiName: 'unit-issuer',
    apiVersion: 'cert-manager.io/v1',
    kind: 'Issuer',
    args: {
      metadata: { name: 'unit-issuer', namespace: 'cert-manager' },
      spec: { selfSigned: {} },
    },
  },
  {
    className: 'ClusterIssuerV1',
    modulePath:
      '../src/resources/k8s/crd/cert-manager/cluster-issuer.v1.res',
    pulumiName: 'unit-cluster-issuer',
    apiVersion: 'cert-manager.io/v1',
    kind: 'ClusterIssuer',
    args: {
      metadata: { name: 'unit-cluster-issuer' },
      spec: { selfSigned: {} },
    },
  },
  {
    className: 'ClusterV1',
    modulePath: '../src/resources/k8s/crd/cnpg/cluster.v1.res',
    pulumiName: 'unit-cnpg-cluster',
    apiVersion: 'postgresql.cnpg.io/v1',
    kind: 'Cluster',
    args: {
      metadata: { name: 'unit-pg', namespace: 'cnpg' },
      spec: {
        instances: 1,
        storage: { size: '1Gi' },
      },
    },
  },
  {
    className: 'VaultConnectionV1',
    modulePath: '../src/resources/k8s/crd/vso/vault-connection.v1.res',
    pulumiName: 'unit-vault-connection',
    apiVersion: 'secrets.hashicorp.com/v1beta1',
    kind: 'VaultConnection',
    args: {
      metadata: { name: 'unit-vso-conn', namespace: 'vault' },
      spec: { address: 'http://vault.vault.svc:8200' },
    },
  },
  {
    className: 'VaultAuthV1',
    modulePath: '../src/resources/k8s/crd/vso/vault-auth.v1.res',
    pulumiName: 'unit-vault-auth',
    apiVersion: 'secrets.hashicorp.com/v1beta1',
    kind: 'VaultAuth',
    args: {
      metadata: { name: 'unit-vso-auth', namespace: 'vault' },
      spec: { method: 'kubernetes', mount: 'kubernetes' },
    },
  },
  {
    className: 'VaultStaticSecretV1',
    modulePath: '../src/resources/k8s/crd/vso/vault-static-secret.v1.res',
    pulumiName: 'unit-vault-static-secret',
    apiVersion: 'secrets.hashicorp.com/v1beta1',
    kind: 'VaultStaticSecret',
    args: {
      metadata: { name: 'unit-vss', namespace: 'vault' },
      spec: {
        mount: 'secret',
        path: 'unit/path',
        type: 'kv-v2',
        destination: { name: 'unit-k8s-secret' },
      },
    },
  },
  {
    className: 'NodeV1Patch',
    modulePath: '../src/resources/k8s/crd/longhorn/node.v1.res',
    pulumiName: 'unit-longhorn-node',
    apiVersion: 'longhorn.io/v1beta2',
    kind: 'Node',
    args: {
      metadata: { name: 'unit-node', namespace: 'longhorn-system' },
    },
  },
];

describe('CRD wrappers', () => {
  beforeEach(() => {
    created.length = 0;
  });

  test.each(cases)('$className sets apiVersion and kind', async row => {
    const loaded = await import(row.modulePath);
    const Ctor = loaded[row.className] as new (
      name: string,
      args: Record<string, unknown>,
    ) => pulumi.CustomResource;

    const resource = new Ctor(row.pulumiName, row.args);
    await unwrap(resource.urn);

    const crd = created.find(
      item =>
        item.inputs.kind === row.kind || item.name === row.pulumiName,
    );
    expect(crd).toBeDefined();
    expect(crd!.inputs.apiVersion).toBe(row.apiVersion);
    expect(crd!.inputs.kind).toBe(row.kind);
  });
});
```

`NodeV1Patch`는 `CustomResource`가 아니라 `CustomResourcePatch`다. `urn`은 둘 다 있다. `kind`는 여전히 `Node`.

- [ ] **Step 2: 실행**

```bash
pnpm --filter @common/custom-resources test -- test/crd-wrappers.test.ts
```

Expected: 16 PASS. `created`가 비면 `unwrap(urn)` 뒤에 `await new Promise(r => setImmediate(r))`를 넣고 재시도. src 변경 금지. VirtualService 행이 있으면 삭제.

- [ ] **Step 3: Commit** (사용자 요청 시에만)

```bash
git add common/custom-resources/test/crd-wrappers.test.ts
git commit -m "$(cat <<'EOF'
test: characterize remaining CRD wrapper apiVersion and kind

EOF
)"
```

---

### Task 2: SftpV1Component

**Files:**
- Create: `common/custom-resources/test/sftp-v1.test.ts`
- Do not modify: `common/custom-resources/src/components/adapter/sftp.v1.component.ts`

**Interfaces:**
- Consumes: `installPulumiMocks`, `unwrap`, `SftpV1Component`
- Produces: 없음

컴포넌트는 host key를 `createKeyFile: false`로, user auth key를 `createKeyFile: true`로 만든다. user key는 TextFile Command를 mock하므로 디스크에 쓰지 않는다. `PULUMI_CONTRACT_KEYS_DIR_PATH`는 `PrivateKeyV1`이 env를 읽으므로 tmp stub가 필요하다.

- [ ] **Step 1: 테스트 작성**

`common/custom-resources/test/sftp-v1.test.ts`:

```typescript
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

let previousKeysDir: string | undefined;
let tmpKeysDir: string;

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
  stateOverrides: args => {
    const type = args.type.toLowerCase();
    if (type.includes('privatekey') || type.includes('tls')) {
      return {
        privateKeyOpenssh: 'mock-openssh',
        privateKeyPem: 'mock-pem',
        publicKeyOpenssh: 'mock-pub-openssh',
        publicKeyPem: 'mock-pub-pem',
      };
    }
    return {};
  },
});

describe('SftpV1Component', () => {
  beforeEach(() => {
    created.length = 0;
    previousKeysDir = process.env.PULUMI_CONTRACT_KEYS_DIR_PATH;
    tmpKeysDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sftp-keys-'));
    process.env.PULUMI_CONTRACT_KEYS_DIR_PATH = tmpKeysDir;
  });

  afterEach(() => {
    if (previousKeysDir === undefined) {
      delete process.env.PULUMI_CONTRACT_KEYS_DIR_PATH;
    } else {
      process.env.PULUMI_CONTRACT_KEYS_DIR_PATH = previousKeysDir;
    }
    fs.rmSync(tmpKeysDir, { recursive: true, force: true });
  });

  test('registers adapter:sftp:v1 and child PrivateKey / VirtualService', async () => {
    const kubernetes = await import('@pulumi/kubernetes');
    const { SftpV1Component } = await import(
      '../src/components/adapter/sftp.v1.component'
    );

    const k8sProvider = new kubernetes.Provider('unit-sftp-k8s', {
      kubeconfig: '{}',
    });

    const sftp = new SftpV1Component('unit-sftp', {
      username: 'alice',
      namespace: 'media',
      targetLabels: { app: 'sftp' },
      uid: 1000,
      gid: 1000,
      volumeMounts: [{ pvcVolumeName: 'data', homeDirName: 'inbox' }],
      directGateway: {
        gatewayPath: 'istio-system/direct',
        port: 2222,
      },
      providers: {
        kubernetes: k8sProvider,
      },
    });

    await unwrap(sftp.output);
    await new Promise(r => setImmediate(r));

    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'Component:adapter:sftp:v1',
          name: 'unit-sftp',
        }),
      ]),
    );

    const tlsKeys = created.filter(
      resource =>
        (resource.type.toLowerCase().includes('privatekey') ||
          resource.type.toLowerCase().includes('tls')) &&
        !resource.type.toLowerCase().startsWith('component'),
    );
    expect(tlsKeys.length).toBeGreaterThanOrEqual(1);
    expect(tlsKeys[0]!.inputs.algorithm).toBe('ED25519');

    const virtualService = created.find(
      resource => resource.inputs.kind === 'VirtualService',
    );
    expect(virtualService).toBeDefined();
    expect(virtualService!.inputs.apiVersion).toBe(
      'networking.istio.io/v1beta1',
    );

    const configMap = created.find(resource =>
      resource.type.toLowerCase().includes('configmap'),
    );
    expect(configMap).toBeDefined();
  });
});
```

- [ ] **Step 2: 실행**

```bash
pnpm --filter @common/custom-resources test -- test/sftp-v1.test.ts
```

Expected: PASS. `PULUMI_CONTRACT_KEYS_DIR_PATH` 미설정 에러면 beforeEach stub가 빠진 것이다. src 변경 금지. 디스크에 키 파일이 생겨도 mock Command라 내용 assert하지 말고 tmpdir만 afterEach에서 지운다.

- [ ] **Step 3: Commit** (사용자 요청 시에만)

```bash
git add common/custom-resources/test/sftp-v1.test.ts
git commit -m "$(cat <<'EOF'
test: mock SftpV1Component type and Istio child

EOF
)"
```

---

### Task 3: SecretV1Component

**Files:**
- Create: `common/custom-resources/test/secret-v1.test.ts`
- Do not modify: `common/custom-resources/src/components/vault/secret.v1.component.ts`

**Interfaces:**
- Consumes: `installPulumiMocks`, `unwrap`, `SecretV1Component`
- Produces: 없음

`installPulumiMocks` 스택 이름은 `test`다. `StackStage.PROD`는 `'prod'`라서 developer Authentik/Vault identity 분기가 탄다. 전체 그래프 스냅샷은 하지 않는다.

Provider 최소 args:

- kubernetes: `{ kubeconfig: '{}' }`
- vault: `{ address: 'http://127.0.0.1:8200' }`
- authentik: `{ url: 'https://authentik.example', token: 'unit-token' }` (`token`/`url` 필수)

- [ ] **Step 1: 테스트 작성**

`common/custom-resources/test/secret-v1.test.ts`:

```typescript
import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
});

describe('SecretV1Component', () => {
  beforeEach(() => {
    created.length = 0;
  });

  test('creates vault kv, k8s SA, and VSO children on non-prod stack', async () => {
    const kubernetes = await import('@pulumi/kubernetes');
    const vault = await import('@pulumi/vault');
    const { authentik } = await import('@common/bridged-provider');
    const { SecretV1Component } = await import(
      '../src/components/vault/secret.v1.component'
    );

    const providers = {
      kubernetes: new kubernetes.Provider('unit-secret-k8s', {
        kubeconfig: '{}',
      }),
      vault: new vault.Provider('unit-secret-vault', {
        address: 'http://127.0.0.1:8200',
      }),
      authentik: new authentik.Provider('unit-secret-ak', {
        url: 'https://authentik.example',
        token: 'unit-token',
      }),
    };

    const secret = new SecretV1Component('unit-secret', {
      oidcMountAccessor: 'auth_oidc_unit',
      coderJwtMountAccessor: 'auth_jwt_unit',
      kvMount: 'secret',
      vaultConnectionRef: 'vault-connection',
      kubernetesAuthMountPath: 'kubernetes',
      namespace: 'apps',
      paths: ['jellyfin', 'media'],
      secrets: {
        shared: { FOO: 'bar' },
        developer: { DEV: '1' },
        runtime: { RUN: '2' },
      },
      providers,
    });

    await unwrap(secret.output);
    await new Promise(r => setImmediate(r));

    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'Component:vault:secret:v1',
          name: 'unit-secret',
        }),
      ]),
    );

    const types = created.map(resource => resource.type.toLowerCase());
    expect(types.some(type => type.includes('secretv2') || type.includes('kv'))).toBe(
      true,
    );
    expect(types.some(type => type.includes('serviceaccount'))).toBe(true);
    expect(types.some(type => type.includes('authentik') && type.includes('group'))).toBe(
      true,
    );

    expect(
      created.some(resource => resource.inputs.kind === 'VaultAuth'),
    ).toBe(true);
    expect(
      created.some(resource => resource.inputs.kind === 'VaultStaticSecret'),
    ).toBe(true);
  });
});
```

자식 필드 값·개수 스냅샷은 하지 않는다. type/kind 존재만.

- [ ] **Step 2: 실행**

```bash
pnpm --filter @common/custom-resources test -- test/secret-v1.test.ts
```

Expected: PASS. authentik Provider가 `Missing required property`면 `url`/`token`이 빠진 것이다. vault Provider args가 거부되면 `address`만 남긴 채 에러 메시지에 나온 필수 필드를 테스트 args에만 추가한다. src 변경 금지.

- [ ] **Step 3: Commit** (사용자 요청 시에만)

```bash
git add common/custom-resources/test/secret-v1.test.ts
git commit -m "$(cat <<'EOF'
test: mock SecretV1Component child resource types

EOF
)"
```

---

### Task 4: KubeConfigFileV1

**Files:**
- Create: `common/custom-resources/test/kube-config-file-v1.test.ts`
- Do not modify: `common/custom-resources/src/resources/k8s/kube-config-file.v1.res.ts`

**Interfaces:**
- Consumes: `installPulumiMocks`, `unwrap`, `KubeConfigFileV1`
- Produces: 없음

생성자가 `process.env.PULUMI_GENERATED_KUBECONFIG_DIR_PATH!!`를 읽는다. 소스 필드명은 `clustser`(오타)다. 테스트도 그 이름을 쓴다. 디스크 쓰기 없음.

- [ ] **Step 1: 테스트 작성**

`common/custom-resources/test/kube-config-file-v1.test.ts`:

```typescript
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

let previousKubeDir: string | undefined;
let tmpKubeDir: string;

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
});

describe('KubeConfigFileV1', () => {
  beforeEach(() => {
    created.length = 0;
    previousKubeDir = process.env.PULUMI_GENERATED_KUBECONFIG_DIR_PATH;
    tmpKubeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeconfig-'));
    process.env.PULUMI_GENERATED_KUBECONFIG_DIR_PATH = tmpKubeDir;
  });

  afterEach(() => {
    if (previousKubeDir === undefined) {
      delete process.env.PULUMI_GENERATED_KUBECONFIG_DIR_PATH;
    } else {
      process.env.PULUMI_GENERATED_KUBECONFIG_DIR_PATH = previousKubeDir;
    }
    fs.rmSync(tmpKubeDir, { recursive: true, force: true });
  });

  test('create payload is kubeconfig YAML and does not write to disk', async () => {
    const { KubeConfigFileV1 } = await import(
      '../src/resources/k8s/kube-config-file.v1.res'
    );

    const file = new KubeConfigFileV1('unit-kubeconfig', {
      name: 'workstation',
      clustser: {
        certificateAuthorityData: '-----BEGIN CERTIFICATE-----\nunit\n-----END CERTIFICATE-----',
        server: 'https://127.0.0.1:6443',
      },
    });

    await unwrap(file.filePath);
    await new Promise(r => setImmediate(r));

    const commandResource = created.find(resource =>
      resource.type.toLowerCase().includes('command'),
    );
    expect(commandResource).toBeDefined();

    const createInput = commandResource!.inputs.create;
    const createCommand =
      typeof createInput === 'string'
        ? createInput
        : await unwrap(createInput as pulumi.Output<string>);

    expect(createCommand).toContain('apiVersion: v1');
    expect(createCommand).toContain('kind: Config');
    expect(createCommand).toContain('https://127.0.0.1:6443');
    expect(createCommand).toContain(`${tmpKubeDir}/workstation.yaml`);

    expect(fs.existsSync(path.join(tmpKubeDir, 'workstation.yaml'))).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: 실행**

```bash
pnpm --filter @common/custom-resources test -- test/kube-config-file-v1.test.ts
```

Expected: PASS. env 미설정으로 throw하면 beforeEach stub 확인. YAML 키가 `apiVersion: v1`이 아니면 `unwrap(create)`가 아직 문자열이 아닌 것이다. src의 `clustser` 오타를 고치지 않는다.

- [ ] **Step 3: Commit** (사용자 요청 시에만)

```bash
git add common/custom-resources/test/kube-config-file-v1.test.ts
git commit -m "$(cat <<'EOF'
test: mock KubeConfigFileV1 kubeconfig YAML create payload

EOF
)"
```

---

### Task 5: AdminApiTokenV1

**Files:**
- Create: `common/custom-resources/test/admin-api-token-v1.test.ts`
- Do not modify: `common/custom-resources/src/resources/coder/admin-api-token.v1.res.ts`

**Interfaces:**
- Consumes: `installPulumiMocks`, `unwrap`, `AdminApiTokenV1`
- Produces: 없음

생성자가 `stdout`을 JSON parse한다. mock state에 유효한 stdout을 넣지 않으면 `unwrap`과 무관하게 apply가 throw한다. 스크립트는 exec하지 않는다. create 문자열에 파일명만 본다.

- [ ] **Step 1: 테스트 작성**

`common/custom-resources/test/admin-api-token-v1.test.ts`:

```typescript
import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
  stateOverrides: args => {
    if (args.type.toLowerCase().includes('command')) {
      return {
        stdout: JSON.stringify({
          token: 'mock-token',
          tokenId: 'mock-token-id',
          organizationId: 'mock-org-id',
        }),
      };
    }
    return {};
  },
});

describe('AdminApiTokenV1', () => {
  beforeEach(() => {
    created.length = 0;
  });

  test('create command references admin-api-token.v1.script.ts', async () => {
    const { AdminApiTokenV1 } = await import(
      '../src/resources/coder/admin-api-token.v1.res'
    );

    const token = new AdminApiTokenV1('unit-admin-token', {
      namespace: 'coder',
      podAppName: 'coder',
      containerName: 'coder',
      coderLocalUrl: 'http://127.0.0.1:8080',
      kubeconfig: '{}',
      adminUser: {
        email: 'admin@example.com',
        username: 'admin',
        fullName: 'Admin',
        password: 'unit-password',
      },
      tokenName: 'unit',
      tokenLifetimeHours: 24,
      expirationMinutes: 60,
    });

    await unwrap(token.urn);
    await new Promise(r => setImmediate(r));

    const commandResource = created.find(resource =>
      resource.type.toLowerCase().includes('command'),
    );
    expect(commandResource).toBeDefined();

    const createInput = commandResource!.inputs.create;
    const createCommand =
      typeof createInput === 'string'
        ? createInput
        : await unwrap(createInput as pulumi.Output<string>);

    expect(createCommand).toContain('admin-api-token.v1.script.ts');
    expect(createCommand).toContain('ts-node/register/transpile-only');
  });
});
```

- [ ] **Step 2: 실행**

```bash
pnpm --filter @common/custom-resources test -- test/admin-api-token-v1.test.ts
```

Expected: PASS. `admin api token script not found`면 Jest가 `src/resources/coder`가 아닌 곳에서 모듈을 돌리는 것이다. `common/custom-resources/package.json`의 `"name": "@common/custom-resources"`와 `scripts/admin-api-token.v1.script.ts` 존재를 확인하고, 테스트 쪽 import 경로만 조정한다. src·스크립트 본문 변경 금지. kubectl exec 호출이 있으면 mock이 아닌 실실행이다. 즉시 중단하고 create 문자열 assert만 남긴다.

- [ ] **Step 3: Commit** (사용자 요청 시에만)

```bash
git add common/custom-resources/test/admin-api-token-v1.test.ts
git commit -m "$(cat <<'EOF'
test: mock AdminApiTokenV1 create script path

EOF
)"
```

---

### Task 6: BootstrapTokenV1

**Files:**
- Create: `common/custom-resources/test/bootstrap-token-v1.test.ts`
- Do not modify: `common/custom-resources/src/resources/vault/bootstrap-token.v1.res.ts`

**Interfaces:**
- Consumes: `installPulumiMocks`, `unwrap`, `BootstrapTokenV1`
- Produces: 없음

`parseBootstrapTokenStdout`을 export하거나 별도 테스트하지 않는다. stdout mock만 넣어 생성자 apply가 살게 한다.

- [ ] **Step 1: 테스트 작성**

`common/custom-resources/test/bootstrap-token-v1.test.ts`:

```typescript
import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
  stateOverrides: args => {
    if (args.type.toLowerCase().includes('command')) {
      return {
        stdout: JSON.stringify({ token: 'mock-bootstrap-token' }),
      };
    }
    return {};
  },
});

describe('BootstrapTokenV1', () => {
  beforeEach(() => {
    created.length = 0;
  });

  test('create command references bootstrap-token.v1.script.ts', async () => {
    const { BootstrapTokenV1 } = await import(
      '../src/resources/vault/bootstrap-token.v1.res'
    );

    const token = new BootstrapTokenV1('unit-bootstrap-token', {
      namespace: 'vault',
      podName: 'vault',
      containerName: 'vault',
      serviceName: 'vault',
      servicePort: 8200,
      kubeconfig: '{}',
      tokenDirPath: '/vault/data',
      bootstrapTokenEncryptionKey: 'unit-key',
      expirationMinutes: 60,
      vaultServerCertificateSecretName: 'vault-tls',
    });

    await unwrap(token.urn);
    await new Promise(r => setImmediate(r));

    const commandResource = created.find(resource =>
      resource.type.toLowerCase().includes('command'),
    );
    expect(commandResource).toBeDefined();

    const createInput = commandResource!.inputs.create;
    const createCommand =
      typeof createInput === 'string'
        ? createInput
        : await unwrap(createInput as pulumi.Output<string>);

    expect(createCommand).toContain('bootstrap-token.v1.script.ts');
    expect(createCommand).toContain('ts-node/register/transpile-only');
  });
});
```

- [ ] **Step 2: 실행**

```bash
pnpm --filter @common/custom-resources test -- test/bootstrap-token-v1.test.ts
```

Expected: PASS. 스크립트 not found 처리는 Task 5와 같다. `parseBootstrapTokenStdout`를 테스트 파일에서 import하면 실패로 보고 src export를 하지 말고 assert를 create 문자열로 되돌린다.

- [ ] **Step 3: Commit** (사용자 요청 시에만)

```bash
git add common/custom-resources/test/bootstrap-token-v1.test.ts
git commit -m "$(cat <<'EOF'
test: mock BootstrapTokenV1 create script path

EOF
)"
```

---

### Task 7: getPolcyExpressionV1

**Files:**
- Create: `common/custom-resources/test/get-policy-expression-v1.test.ts`
- Do not modify: `common/custom-resources/src/data/authentik/policy-expression.v1.data.ts`

**Interfaces:**
- Consumes: `installPulumiMocks`, `unwrap`, `getPolcyExpressionV1`
- Produces: 없음

함수 이름 오타 `getPolcyExpressionV1`는 소스 그대로. `installPulumiMocks`의 preview 인자는 `false`라 `isDryRun()`이 false고 axios 분기를 탄다. 라이브 HTTP 금지.

- [ ] **Step 1: 테스트 작성**

`common/custom-resources/test/get-policy-expression-v1.test.ts`:

```typescript
import axios from 'axios';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

installPulumiMocks();

const axiosGet = axios.get as jest.Mock;

describe('getPolcyExpressionV1', () => {
  beforeEach(() => {
    axiosGet.mockReset();
  });

  test('GETs expression search URL with Bearer and returns matching name', async () => {
    axiosGet.mockResolvedValue({
      data: {
        pagination: {
          next: 0,
          previous: 0,
          count: 1,
          current: 1,
          total_pages: 1,
          start_index: 1,
          end_index: 1,
        },
        results: [
          {
            pk: 'pk-1',
            name: 'unit-policy',
            execution_logging: false,
            component: 'ak_policies.expression.models.ExpressionPolicy',
            verbose_name: 'Expression Policy',
            verbose_name_plural: 'Expression Policies',
            meta_model_name: 'authentik_policies_expression.expressionpolicy',
            bound_to: 1,
            expression: 'return True',
          },
        ],
        autocomplete: {},
      },
    });

    const { getPolcyExpressionV1 } = await import(
      '../src/data/authentik/policy-expression.v1.data'
    );

    const result = await unwrap(
      getPolcyExpressionV1({
        name: 'unit-policy',
        authentikUrl: 'https://authentik.example',
        authentikToken: 'unit-token',
      }),
    );

    expect(axiosGet).toHaveBeenCalledWith(
      'https://authentik.example/api/v3/policies/expression/?search=unit-policy',
      {
        headers: {
          Authorization: 'Bearer unit-token',
        },
      },
    );
    expect(result.name).toBe('unit-policy');
    expect(result.pk).toBe('pk-1');
    expect(result.expression).toBe('return True');
  });
});
```

`jest.mock`은 import보다 위에 있어야 호이스트된다. `axios` import는 mock 팩토리 다음이어도 Jest가 호이스트한다.

결과가 `{ pk: 'Preview PK', ... }`면 `isDryRun()`이 true다. `installPulumiMocks()` 호출이 빠졌거나 preview 인자를 `true`로 바꾼 것이다. `pulumi-mocks.ts`의 마지막 인자 `false`를 유지한다.

- [ ] **Step 2: 실행**

```bash
pnpm --filter @common/custom-resources test -- test/get-policy-expression-v1.test.ts
```

Expected: PASS. `axios.get is not a function`이면 mock 팩토리가 default export 모양이 아닌 것이다. 테스트 파일의 `jest.mock('axios', ...)`만 실제 모듈 shape에 맞게 고친다. src 변경 금지. 네트워크 타임아웃이면 mock이 안 먹은 것이다.

- [ ] **Step 3: Commit** (사용자 요청 시에만)

```bash
git add common/custom-resources/test/get-policy-expression-v1.test.ts
git commit -m "$(cat <<'EOF'
test: mock getPolcyExpressionV1 Authentik GET

EOF
)"
```

---

### Task 8: 수용 기준 검증

**Files:**
- Modify: `docs/issues/2026-09-09-jest-custom-resources-spec-2.md` 타임라인 append, 수용 기준 체크, 상태
- Do not modify: 프로덕션 src

**Interfaces:**
- Consumes: Task 1–7 산출물
- Produces: spec 수용 기준이 증거와 맞음

- [ ] **Step 1: custom-resources 전체 + utils 회귀**

```bash
pnpm --filter @common/custom-resources test
pnpm --filter @common/utils test
```

Expected:

- custom-resources: 기존 3 (`text-file`, `private-key`, `virtual-service`) + Task 1–7 전부 PASS. CRD 16 + fat 6.
- utils: Spec 1과 동일하게 초록. 실패하면 Spec 2 테스트가 utils를 import/오염한 것이다. utils 테스트를 고치지 말고 custom-resources 쪽 import를 되돌린다.

- [ ] **Step 2: src diff**

```bash
git diff -- common/custom-resources/src common/utils/src
```

Expected: 빈 diff.

- [ ] **Step 3: spec 타임라인**

`docs/issues/2026-09-09-jest-custom-resources-spec-2.md` 수용 기준 체크박스를 채운다. 메타 `상태`를 **적용**으로 바꾼다. **해결**로 바꾸거나 `docs/resolved`로 옮기지 않는다.

타임라인 끝에만 행을 추가한다.

```markdown
| 2026-09-09 | Spec 2 구현. CRD 16 + fat 6 mock 테스트 초록. src 변경 없음 |
```

- [ ] **Step 4: Commit** (사용자 요청 시에만)

```bash
git add docs/issues/2026-09-09-jest-custom-resources-spec-2.md docs/issues/2026-09-09-jest-custom-resources-spec-2-plan.md common/custom-resources/test
git commit -m "$(cat <<'EOF'
docs: record Jest Spec 2 acceptance

EOF
)"
```

이미 Task 1–7에서 테스트 파일을 커밋했다면 이 스텝은 spec 문서만 add한다.

---

## Self-review

- Spec 수용 기준 5개 → Task 1(CRD 16), Task 2–7(fat 6), Task 8(전체 초록·utils 회귀·src diff).
- Spec 파일 표의 테스트 파일 7개 → Task 1–7과 1:1.
- Spec CRD 표 16행 → Task 1 `cases` 배열과 class/apiVersion/kind 일치. VirtualService 없음.
- `parseBootstrapTokenStdout` export 없음 → Task 6.
- axios 라이브 금지 → Task 7 `jest.mock`.
- Placeholder (`TBD`, “similar to Task N”) 없음.
- `unwrap` / `installPulumiMocks` 시그니처는 Spec 1 harness 그대로. 이 플랜에서 수정하지 않음.
- 소스 오타 (`clustser`, `getPolcyExpressionV1`)를 테스트가 그대로 사용.
