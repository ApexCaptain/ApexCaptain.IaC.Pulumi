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

