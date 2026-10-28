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
});

async function inflate() {
  const kubernetes = await import('@pulumi/kubernetes');
  const { AuthentikHelmChartComponent } = await import(
    '../src/components/authentik/authentik.helm-chart.component'
  );

  const recorder = createResourceOptionsRecorder();
  const authentik = new AuthentikHelmChartComponent(
    'unit-authentik',
    {
      // contract.ts와 같은 값. Helm values의 DB host가 이 namespace를 가정한다.
      namespace: 'authentik',
      helm: {
        authentik: {
          version: '0.0.0-unit',
          repositoryUrl: 'https://charts.goauthentik.io',
        },
      },
      secretKey: 'mock-secret-key',
      host: 'auth.example.com',
      secrets: {
        bootstrap: {
          token: 'mock-token',
          email: 'admin@example.com',
          password: 'mock-password',
        },
        postgresqlPassword: 'mock-pg-password',
      },
      pvc: {
        postgresql: { storageClass: 'longhorn-ssd', size: '5Gi' },
      },
      providers: {
        kubernetes: new kubernetes.Provider('unit-k8s', { kubeconfig: '{}' }),
      },
    },
    { transformations: [recorder.transformation] },
  );

  await unwrap(authentik.output);
  await settle(() => created.length);
  const release = created.find(
    resource => resource.type === 'kubernetes:helm.sh/v3:Release',
  );
  const dbCluster = created.find(
    resource =>
      resource.inputs.apiVersion === 'postgresql.cnpg.io/v1' &&
      resource.inputs.kind === 'Cluster',
  );
  return { recorder, release, dbCluster };
}

describe('AuthentikHelmChartComponent', () => {
  beforeEach(() => {
    created.length = 0;
  });

  test('protects namespace and CNPG cluster (DB data)', async () => {
    const { recorder } = await inflate();

    const protectedNames = [...recorder.options.entries()]
      .filter(([, { opts }]) => opts.protect === true)
      .map(([name]) => name)
      .sort();

    expect(protectedNames).toEqual(
      [
        'unit-authentik-namespace',
        'unit-authentik-authentikDatabaseCluster',
      ].sort(),
    );
    for (const name of protectedNames) {
      expect(recorder.options.get(name)!.opts.retainOnDelete).toBe(true);
    }
  });

  test('chart-embedded PostgreSQL is disabled (external CNPG only)', async () => {
    const { release } = await inflate();
    expect(release!.inputs.values.postgresql.enabled).toBe(false);
  });

  test('DB host points at the CNPG read-write service', async () => {
    const { release, dbCluster } = await inflate();
    const postgresql = release!.inputs.values.authentik.postgresql;
    const { name, namespace } = dbCluster!.inputs.metadata;

    expect(postgresql.host).toBe(`${name}-rw.${namespace}.svc.cluster.local`);
    expect(postgresql.port).toBe(5432);
    expect(postgresql.name).toBe(dbCluster!.inputs.spec.bootstrap.initdb.database);
    expect(postgresql.user).toBe(dbCluster!.inputs.spec.bootstrap.initdb.owner);
  });

  test('DB password is read from mounted file, not inlined', async () => {
    const { release } = await inflate();
    const values = release!.inputs.values;
    const password: string = values.authentik.postgresql.password;

    expect(password).toMatch(/^file:\/\//);
    expect(JSON.stringify(values)).not.toContain('mock-pg-password');

    const mountPath = password.replace(/^file:\/\//, '').replace(/\/[^/]+$/, '');
    for (const role of ['server', 'worker'] as const) {
      expect(values[role].volumeMounts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ mountPath, readOnly: true }),
        ]),
      );
    }
  });

  test('CNPG storage follows args', async () => {
    const { dbCluster } = await inflate();
    expect(dbCluster!.inputs.spec.storage).toEqual({
      size: '5Gi',
      storageClass: 'longhorn-ssd',
    });
  });
});
