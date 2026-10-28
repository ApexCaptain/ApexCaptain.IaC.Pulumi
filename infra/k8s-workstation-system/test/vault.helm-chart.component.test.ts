import {
  createResourceOptionsRecorder,
  installPulumiMocks,
  revealSecrets,
  settle,
  unwrap,
} from '@common/utils/src/testing';
import * as pulumi from '@pulumi/pulumi';

const created: pulumi.runtime.MockResourceArgs[] = [];

installPulumiMocks({
  onNewResource: args => {
    created.push({ ...args, inputs: revealSecrets(args.inputs) });
  },
  stateOverrides: args => {
    // BootstrapTokenV1 — Command stdout을 token으로 파싱
    if (args.type.toLowerCase().includes('command')) {
      return { stdout: JSON.stringify({ token: 'mock-bootstrap-token' }) };
    }
    return {};
  },
});

async function inflate() {
  const kubernetes = await import('@pulumi/kubernetes');
  const { VaultHelmChartComponent } = await import(
    '../src/components/vault/vault.helm-chart.component'
  );

  const recorder = createResourceOptionsRecorder();
  const vault = new VaultHelmChartComponent(
    'unit-vault',
    {
      helm: {
        vault: {
          version: '0.0.0-unit',
          repositoryUrl: 'https://helm.releases.hashicorp.com',
        },
      },
      kms: {
        oci: {
          keyId: 'ocid1.key.unit',
          cryptoEndpoint: 'https://crypto.unit',
          managementEndpoint: 'https://management.unit',
        },
      },
      unsealAuth: {
        userOcid: 'ocid1.user.unit',
        tenancyOcid: 'ocid1.tenancy.unit',
        fingerprint: 'aa:bb',
        privateKey: 'mock-private-key',
        region: 'ap-unit-1',
      },
      pvc: {
        server: { storageClass: 'longhorn-ssd', size: '10Gi' },
      },
      bootstrapToken: {
        kubeconfig: '{}',
        bootstrapTokenEncryptionKey: 'unit-key',
      },
      providers: {
        kubernetes: new kubernetes.Provider('unit-k8s', { kubeconfig: '{}' }),
      },
    },
    { transformations: [recorder.transformation] },
  );

  const output = await unwrap(vault.output);
  await settle(() => created.length);
  const release = created.find(
    resource => resource.type === 'kubernetes:helm.sh/v3:Release',
  );
  return { recorder, output, release };
}

describe('VaultHelmChartComponent', () => {
  beforeEach(() => {
    created.length = 0;
  });

  test('protects namespace and Helm release (raft data)', async () => {
    const { recorder } = await inflate();

    const protectedNames = [...recorder.options.entries()]
      .filter(([, { opts }]) => opts.protect === true)
      .map(([name]) => name)
      .sort();

    expect(protectedNames).toEqual(
      ['unit-vault-namespace', 'unit-vault-vaultRelease'].sort(),
    );
    for (const name of protectedNames) {
      expect(recorder.options.get(name)!.opts.retainOnDelete).toBe(true);
    }
  });

  test('Helm values: TLS on, raft PVC from args, injector off', async () => {
    const { release } = await inflate();
    const values = release!.inputs.values;

    expect(values.global.tlsDisable).toBe(false);
    expect(values.injector.enabled).toBe(false);
    expect(values.server.dev.enabled).toBe(false);
    expect(values.server.dataStorage).toMatchObject({
      enabled: true,
      size: '10Gi',
      storageClass: 'longhorn-ssd',
      mountPath: '/vault/data',
    });
    expect(values.server.ha.raft.enabled).toBe(true);
  });

  test('raft config: TLS listener and OCI KMS auto-unseal from args', async () => {
    const { release } = await inflate();
    const config: string = release!.inputs.values.server.ha.raft.config;

    expect(config).toContain('tls_disable = false');
    expect(config).toContain(
      'tls_cert_file = "/vault/userconfig/vault-server-certificate-secret/tls.crt"',
    );
    expect(config).toMatch(/seal "ocikms" \{/);
    expect(config).toContain('key_id = "ocid1.key.unit"');
    expect(config).toContain('crypto_endpoint = "https://crypto.unit"');
    expect(config).toContain('management_endpoint = "https://management.unit"');
    expect(config).toContain('path = "/vault/data"');
  });

  test('server TLS cert secret is mounted and watched by Reloader', async () => {
    const { release } = await inflate();
    const server = release!.inputs.values.server;

    expect(server.extraVolumes).toEqual(
      expect.arrayContaining([
        { type: 'secret', name: 'vault-server-certificate-secret' },
        { type: 'secret', name: 'vault-oci-credentials' },
      ]),
    );
    expect(server.statefulSet.annotations).toEqual({
      'secret.reloader.stakater.com/reload': 'vault-server-certificate-secret',
    });
  });

  test('output TLS serverName matches namespace', async () => {
    const { output } = await inflate();
    expect(output.tls.serverName).toBe('vault.vault.svc.cluster.local');
  });
});
