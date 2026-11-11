/**
 * contract 단위 테스트 — phase 조립 결과를 검증한다. 컴포넌트 내부는 각 component 테스트 몫.
 *
 * - 최상위 리소스(type::name): 이름이 바뀌면 URN이 바뀐다. phase 이동·추가 시 의도한 변경인지 확인
 * - output·secret 키 순서: 실제 `Contract`가 `JSON.stringify` 결과로 hash를 만든다
 * - 배포 순서: contract JSDoc의 제약이 `dependsOn`으로 남아 있는지
 */
import * as path from 'path';
import { installPulumiMocks, settle, unwrap } from '@common/utils/src/testing';
import * as pulumi from '@pulumi/pulumi';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const runtimeResource = require('@pulumi/pulumi/runtime/resource');

const PROJECT = 'k8s-workstation-tools';

// 다른 스택 contract가 내보내는 값 중 tools가 읽는 키만.
const mockContractFixtures: Record<
  string,
  { output: unknown; secret: unknown }
> = {
  'cloudflare': {
    output: {
      zones: {
        ayteneve93com: {
          domain: 'example.com',
          records: Object.fromEntries(
            ['coder', 'todo', 'auth', 'torrent'].map(key => [
              key,
              `${key}.example.com`,
            ]),
          ),
        },
      },
    },
    secret: {
      apexCaptainCloudflareApiToken: 'mock-token',
      apexCaptainCloudflareEmail: 'mock@example.com',
    },
  },
  'github': {
    output: {
      repositories: {
        apexCaptainIacGitOps: {
          name: 'gitops',
          sshCloneUrl: 'git@github.com:example/gitops.git',
        },
      },
    },
    secret: {},
  },
  'k8s-workstation-system': {
    output: {
      namespaces: { istio: 'istio-system' },
      serviceMesh: { istioIngressGatewayLabel: 'ingressgateway' },
      serviceAccounts: { istioIngressGateway: 'istio-ingressgateway-sa' },
      gatewayPaths: {
        ingressGatewayPath: 'istio-system/ingress-gateway',
        directGatewayPath: 'istio-system/direct-gateway',
      },
      storageClasses: {
        longhornSsd: 'longhorn-ssd',
        longhornHdd: 'longhorn-hdd',
      },
      kata: { runtimeClassName: 'kata-qemu' },
      authentik: {
        flow: {
          defaultProviderAuthorizationImplicitConsentId: 'flow-authz',
          defaultInvalidationFlowId: 'flow-logout',
        },
        groupIds: {
          toolsUserGroup: 'tools-user',
          toolsManagerGroup: 'tools-manager',
        },
        outposts: {
          proxy: {
            id: 'proxy-outpost-id',
            providerName: 'longhorn-proxy',
          },
        },
      },
      vaultSecretsOperator: {
        vaultConnectionRef: 'vault-secrets-operator/vault',
      },
      vault: {
        host: 'vault.example.com',
        coderJwt: {
          mountPath: 'jwt-coder',
          roleName: 'coder',
        },
        identityGroupIds: { 'System Manager': 'identity-group-id' },
      },
      pcloudBackup: {
        namespace: 'pcloud-backup',
        configMapName: 'pcloud-config',
        credentialsSecretName: 'pcloud-creds',
        slackSecretName: 'pcloud-slack',
        drLeaseName: 'pcloud-dr-lease',
        volumeSnapshotClassName: 'longhorn-snapclass',
      },
    },
    secret: {
      providerConfigs: {
        authentik: { url: 'https://auth.example.com', token: 'mock' },
        vault: { address: 'https://vault.example.com', token: 'mock' },
      },
      vault: {
        kvMount: 'secret',
        kubernetesAuthMountPath: 'kubernetes',
        ssh: {
          userCaMount: 'ssh-user-ca',
          hostCaMount: 'ssh-host-ca',
        },
        cluster: {
          address: 'https://vault.vault.svc:8200',
          tlsServerName: 'vault.vault.svc',
          namespace: 'vault',
          rootCaSecretName: 'vault-tls',
        },
      },
    },
  },
};

/**
 * 실제 `Contract`는 Pulumi.yaml·Pulumi.<stage>.yaml(projen 생성물, gitignore)로 프로젝트를 찾고
 * StackReference·hash 파일을 만든다. CI에는 그 파일이 없고, 이 테스트 대상도 아니다.
 * tools는 inflate만, 나머지 스택은 fixture를 돌려준다.
 */
jest.mock('@common/nexus', () => {
  const actual = jest.requireActual('@common/nexus');
  const pulumiSdk = jest.requireActual('@pulumi/pulumi');
  class ContractDouble {
    readonly output: unknown;
    readonly secret: unknown;
    constructor(
      callerPath: string,
      inflateContract: () => Promise<{ output: unknown; secret: unknown }>,
    ) {
      const project = callerPath.split('/infra/')[1].split('/')[0];
      if (project === 'k8s-workstation-tools') {
        const inflated = pulumiSdk.output(Promise.resolve(inflateContract()));
        this.output = pulumiSdk.unsecret(
          inflated.apply((result: { output: unknown }) => result.output),
        );
        this.secret = inflated.apply(
          (result: { secret: unknown }) => result.secret,
        );
        return;
      }
      const fixture = mockContractFixtures[project];
      if (!fixture) throw new Error(`no contract fixture for ${project}`);
      this.output = pulumiSdk.output(fixture.output);
      this.secret = pulumiSdk.secret(fixture.secret);
    }
  }
  return { ...actual, classes: { ...actual.classes, Contract: ContractDouble } };
});

installPulumiMocks({
  project: PROJECT,
  stack: 'prod',
  organization: 'unit',
  callResult: args => ({
    id: `${args.token}-id`,
    result: `${args.token}-result`,
    ...args.inputs,
  }),
  stateOverrides: args => {
    // BootstrapToken·Coder AdminApiTokenV1 등 — Command stdout을 JSON으로 파싱
    if (args.type.toLowerCase().includes('command')) {
      return {
        stdout: JSON.stringify({
          token: 'mock-bootstrap-token',
          tokenId: 'mock-token-id',
          organizationId: 'mock-org-id',
        }),
      };
    }
    if (args.type === 'kubernetes:core/v1:Secret') {
      const encoded = (value: string) => Buffer.from(value).toString('base64');
      return {
        data: {
          'ca.crt': encoded('mock-ca'),
          'token': encoded('mock-token'),
          ...args.inputs.data,
        },
      };
    }
    return {};
  },
});

interface Registered {
  type: string;
  name: string;
  parent?: pulumi.Resource;
  dependsOn: pulumi.Resource[];
}

const registered = new Map<pulumi.Resource, Registered>();
const originalRegisterResource = runtimeResource.registerResource;
runtimeResource.registerResource = (
  res: pulumi.Resource,
  parent: pulumi.Resource | undefined,
  type: string,
  name: string,
  ...rest: unknown[]
) => {
  const opts = rest[4] as pulumi.ResourceOptions;
  const dependsOn = opts.dependsOn;
  registered.set(res, {
    type,
    name,
    parent,
    dependsOn: (Array.isArray(dependsOn)
      ? dependsOn
      : dependsOn
        ? [dependsOn]
        : []) as pulumi.Resource[],
  });
  return originalRegisterResource(res, parent, type, name, ...rest);
};

const fakeOverrides: Record<string, unknown> = {
  workstationKubeconfig: JSON.stringify({
    'current-context': 'unit',
    'contexts': [{ name: 'unit', context: { cluster: 'unit' } }],
    'clusters': [
      {
        name: 'unit',
        cluster: {
          'server': 'https://127.0.0.1:6443',
          'certificate-authority-data': Buffer.from('mock-ca').toString('base64'),
        },
      },
    ],
  }),
};

/** ESC zod 스키마를 따라 모든 필드를 채운 가짜 값. 값 자체는 검증 대상이 아니다. */
function fakeFromZod(schema: any, key: string): unknown {
  if (key in fakeOverrides) return fakeOverrides[key];
  const def = schema._zod.def;
  switch (def.type) {
    case 'object':
      return Object.fromEntries(
        Object.entries(def.shape).map(([childKey, child]) => [
          childKey,
          fakeFromZod(child, childKey),
        ]),
      );
    case 'optional':
    case 'nullable':
    case 'nonoptional':
    case 'readonly':
    case 'default':
      return fakeFromZod(def.innerType, key);
    case 'enum':
      return Object.values(def.entries)[0];
    case 'literal':
      return def.values[0];
    case 'array':
      return [];
    case 'record':
      return {};
    case 'number':
      return 1;
    case 'boolean':
      return false;
    default:
      return def.format === 'ipv4' ? '10.0.0.1' : `mock-${key}`;
  }
}

async function inflate() {
  for (const name of [
    'PULUMI_CONTRACT_KEYS_DIR_PATH',
    'PULUMI_GENERATED_KUBECONFIG_DIR_PATH',
  ]) {
    process.env[name] = path.join(__dirname, '.unused', name);
  }
  const nexus = await import('@common/nexus');
  const config: Record<string, string> = {};
  for (const esc of Object.values(nexus.esc) as any[]) {
    config[`${PROJECT}:${esc.escName}`] = JSON.stringify(
      fakeFromZod(esc.escSchema, esc.escName),
    );
  }
  pulumi.runtime.setAllConfig(config, Object.keys(config));

  const { k8sWorkstationToolsContract } = await import('../src/contract');
  const output = await unwrap(k8sWorkstationToolsContract.output);
  const secret = await unwrap(k8sWorkstationToolsContract.secret);
  await settle(() => registered.size);

  const byName = new Map<string, Registered>();
  for (const entry of registered.values()) {
    if (!entry.parent) byName.set(entry.name, entry);
  }
  return { output, secret, topLevel: byName };
}

/** 객체 키를 순서 그대로 `a.b.c` 경로로 편다 (배열·원시값에서 멈춤). */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const current = prefix ? `${prefix}.${key}` : key;
    return [current, ...keyPaths(child, current)];
  });
}

describe('k8sWorkstationToolsContract', () => {
  let inflated: Awaited<ReturnType<typeof inflate>>;

  beforeAll(async () => {
    inflated = await inflate();
  }, 60_000);

  test('top-level resources keep type and name (URN)', () => {
    const resources = [...inflated.topLevel.values()]
      .map(({ type, name }) => `${type}::${name}`)
      .sort();

    expect(resources).toMatchSnapshot();
  });

  test('output and secret key order is stable (contract hash)', () => {
    expect({
      output: keyPaths(inflated.output),
      secret: keyPaths(inflated.secret),
    }).toMatchSnapshot();
  });

  test.each([
    ['coderHelmChart', 'coderBase', 'Coder Helm은 base NS·PG secret'],
    ['coderHelmChart', 'coderAuthentik', 'Coder Helm은 OIDC client'],
    ['coderServiceMesh', 'coderHelmChart', 'mesh는 Helm service·token'],
    ['coderdProvider', 'coderServiceMesh', 'coderd는 mesh가 만든 provider config'],
    ['coderResources', 'coderBase', '템플릿은 workspace NS'],
    ['coderResources', 'coderdProvider', '템플릿은 coderd Provider'],
    ['vikunjaHelmChart', 'vikunjaBase', 'Vikunja Helm은 base NS·PG'],
    ['vikunjaHelmChart', 'vikunjaAuthentik', 'Vikunja Helm은 OIDC client'],
    ['vikunjaBackup', 'vikunjaHelmChart', 'backup은 data PVC'],
    ['vikunjaServiceMesh', 'vikunjaHelmChart', 'mesh는 Helm service'],
    ['qbittorrentBackup', 'qbittorrentApp', 'backup은 config PVC'],
    ['zeroTrustAccess', 'zeroTrustAuthentik', 'Access IdP는 Authentik OIDC'],
    ['zeroTrustConnector', 'zeroTrustTunnel', 'connector는 tunnel token'],
  ])('%s dependsOn %s (%s)', (name, dependency) => {
    const resource = inflated.topLevel.get(name);
    const required = inflated.topLevel.get(dependency);
    expect(resource).toBeDefined();
    expect(required).toBeDefined();

    const dependsOnNames = resource!.dependsOn.map(
      each => registered.get(each)?.name,
    );
    expect(dependsOnNames).toContain(dependency);
  });
});
