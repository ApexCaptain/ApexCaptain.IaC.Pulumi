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
