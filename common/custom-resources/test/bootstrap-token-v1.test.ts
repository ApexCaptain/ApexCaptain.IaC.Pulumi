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
