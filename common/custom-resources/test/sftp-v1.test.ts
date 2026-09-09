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
