import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

// flat@6 is ESM-only; ts-jest CJS runtime cannot require it.
jest.mock('flat', () => ({
  flatten: (obj: Record<string, unknown>) => obj,
}));

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
