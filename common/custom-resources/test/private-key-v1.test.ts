import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
});

describe('PrivateKeyV1Component', () => {
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
