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

describe('PrivateKeyV1Component', () => {
  beforeEach(() => {
    previousKeysDir = process.env.PULUMI_CONTRACT_KEYS_DIR_PATH;
    tmpKeysDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-'));
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

  test('requests ED25519 and does not write a key file by default', async () => {
    const { PrivateKeyV1Component } = await import(
      '../src/components/tls/private-key.v1.component'
    );

    const key = new PrivateKeyV1Component('unit-key', {
      createKeyFile: false,
    });

    const secret = await unwrap(key.secret);
    expect(secret.privateKey.openssh).toBe('mock-openssh');

    const tlsKey = created.find(
      resource =>
        (resource.type.toLowerCase().includes('privatekey') ||
          resource.type.toLowerCase().includes('tls')) &&
        !resource.type.toLowerCase().startsWith('component'),
    );
    expect(tlsKey).toBeDefined();
    expect(tlsKey!.inputs.algorithm).toBe('ED25519');

    const textFiles = created.filter(resource =>
      resource.type.toLowerCase().includes('command'),
    );
    expect(textFiles).toHaveLength(0);
  });
});
