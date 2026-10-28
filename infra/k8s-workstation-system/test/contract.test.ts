/**
 * contract 단위 테스트 — phase 조립 결과를 검증한다. 컴포넌트 내부는 각 component 테스트 몫.
 *
 * - 최상위 리소스(type::name): 이름이 바뀌면 URN이 바뀐다. phase 이동·추가 시 의도한 변경인지 확인
 * - output·secret 키 순서: `JSON.stringify` 결과로 contract hash를 만든다
 * - 배포 순서: contract JSDoc의 제약이 `dependsOn`으로 남아 있는지
 */
import * as path from 'path';
import { installPulumiMocks, settle, unwrap } from '@common/utils/src/testing';
import * as pulumi from '@pulumi/pulumi';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const runtimeResource = require('@pulumi/pulumi/runtime/resource');

const PROJECT = 'k8s-workstation-system';

const stackReferenceOutputs: Record<string, Record<string, unknown>> = {
  cloudflare: {
    output: {
      zones: {
        ayteneve93com: {
          domain: 'example.com',
          records: Object.fromEntries(
            ['vault', 'auth', 'longhorn', 'goldilocks', 'argoCd', 'grafana'].map(
              key => [key, `${key}.example.com`],
            ),
          ),
        },
      },
    },
    secret: {
      apexCaptainCloudflareApiToken: 'mock-token',
      apexCaptainCloudflareEmail: 'mock@example.com',
    },
  },
  github: {
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
};

installPulumiMocks({
  project: PROJECT,
  stack: 'prod',
  organization: 'unit',
  // invoke 결과: data source는 id, std 함수는 result를 쓴다
  callResult: args => ({
    id: `${args.token}-id`,
    result: `${args.token}-result`, // std.md5 등
    ...args.inputs,
  }),
  stateOverrides: args => {
    if (args.type === 'pulumi:pulumi:StackReference') {
      const project = String(args.inputs.name).split('/')[1];
      return { outputs: stackReferenceOutputs[project] ?? {} };
    }
    // BootstrapTokenV1 등 — Command stdout을 JSON으로 파싱
    if (args.type.toLowerCase().includes('command')) {
      return { stdout: JSON.stringify({ token: 'mock-bootstrap-token' }) };
    }
    // CA·SA token Secret (읽기 + `service-account-token` 생성). 컴포넌트가 data를 파싱한다.
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

// mock newResource는 parent·dependsOn을 받지 않으므로 등록 지점에서 기록한다.
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

// 컴포넌트가 생성 시점에 파싱하는 필드만 형식을 맞춘다.
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
  // devcontainer가 넣는 경로 env. turbo·CI에는 없다. 파일 쓰기는 mock Command라 실제로 일어나지 않는다.
  for (const name of [
    'PULUMI_CONTRACT_HASH_DIR_PATH',
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

  const { k8sWorkstationSystemContract } = await import('../src/contract');
  const output = await unwrap(k8sWorkstationSystemContract.output);
  const secret = await unwrap(k8sWorkstationSystemContract.secret);
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

describe('k8sWorkstationSystemContract', () => {
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

  // [resource, 반드시 dependsOn에 있어야 하는 선행 리소스, 이유]
  test.each([
    ['vaultHelmChart', 'certManagerHelmChart', 'Vault TLS는 cert-manager CA'],
    ['istioGateway', 'certManagerResources', 'ingress는 LE wildcard cert'],
    ['authentikHelmChart', 'longhornResources', 'Authentik PG PVC는 Longhorn SSD SC'],
    ['authentikHelmChart', 'postgresqlOperatorHelmChart', 'Authentik DB는 CNPG Cluster'],
    ['authentikResources', 'authentikServiceMesh', 'Authentik Provider는 ingress 경유'],
    ['authentikOutpost', 'longhornServiceMesh', 'Outpost는 Longhorn ProviderProxy를 bootstrap으로 생성'],
    ['goldilocksServiceMesh', 'authentikOutpost', 'proxy 앱은 Outpost 이후 attachment'],
    ['vaultAuthentik', 'authentikResources', 'Vault OIDC는 Authentik group·flow 이후'],
    ['vaultBackup', 'vaultKubernetesAuth', 'raft 백업 Job은 Vault k8s auth 사용'],
    ['vaultBackup', 'pcloudBackupPlatform', '백업 Job은 platform credentials·Lease 사용'],
    ['argoCd', 'redisOperatorHelmChart', 'Argo CD Redis는 Redis Operator CR'],
    ['grafanaHelmChart', 'grafanaAuthentik', 'Grafana OIDC client'],
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
