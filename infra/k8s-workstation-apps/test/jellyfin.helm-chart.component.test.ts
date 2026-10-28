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
  const vault = await import('@pulumi/vault');
  const { JellyfinHelmChartComponent } = await import(
    '../src/components/jellyfin/jellyfin.helm-chart.component'
  );

  const recorder = createResourceOptionsRecorder();
  const jellyfin = new JellyfinHelmChartComponent(
    'unit-jellyfin',
    {
      helm: {
        jellyfin: {
          version: '0.0.0-unit',
          repositoryUrl: 'https://jellyfin.github.io/jellyfin-helm',
        },
      },
      sftpUserName: 'alice',
      sftp: {
        issuerGroupName: 'System Manager',
        issuerIdentityGroupId: 'identity-group-id',
        hostPrincipals: ['sftp.example.com'],
        userCaMount: 'ssh-user-ca',
        hostCaMount: 'ssh-host-ca',
        kvMount: 'secret',
        slackWebhookUrl: 'https://hooks.slack.com/services/mock',
        vaultConnectionRef: 'vault-secrets-operator/vault',
        kubernetesAuthMountPath: 'kubernetes',
        vault: {
          address: 'https://vault.vault.svc:8200',
          tlsServerName: 'vault.vault.svc',
          ca: { namespace: 'vault', secretName: 'vault-ca' },
        },
      },
      directGateway: {
        gatewayPath: 'istio-system/direct',
        jellyfinSftp: { port: 2223 },
      },
      pvc: {
        jellyfinConfig: { storageClass: 'longhorn-ssd', size: '5Gi' },
        jellyfinMedia: { storageClass: 'longhorn-hdd', size: '2Ti' },
        jellyfinCache: { storageClass: 'longhorn-ssd', size: '20Gi' },
      },
      gpu: { runtimeClassName: 'nvidia' },
      providers: {
        kubernetes: new kubernetes.Provider('unit-k8s', { kubeconfig: '{}' }),
        vault: new vault.Provider('unit-vault', {
          address: 'http://127.0.0.1:8200',
        }),
      },
    },
    { transformations: [recorder.transformation] },
  );

  await unwrap(jellyfin.output);
  await settle(() => created.length);
  const release = created.find(
    resource => resource.type === 'kubernetes:helm.sh/v3:Release',
  );
  return { recorder, release };
}

describe('JellyfinHelmChartComponent', () => {
  beforeEach(() => {
    created.length = 0;
  });

  test('protects namespace, config and media PVCs (cache is disposable)', async () => {
    const { recorder } = await inflate();

    const protectedNames = [...recorder.options.entries()]
      .filter(([, { opts }]) => opts.protect === true)
      .map(([name]) => name)
      .sort();

    expect(protectedNames).toEqual(
      [
        'unit-jellyfin-namespace',
        'unit-jellyfin-jellyfinConfigPvc',
        'unit-jellyfin-jellyfinMediaPvc',
      ].sort(),
    );
    for (const name of protectedNames) {
      expect(recorder.options.get(name)!.opts.retainOnDelete).toBe(true);
    }
  });

  test('Helm persistence binds to the PVCs this component creates', async () => {
    const { release } = await inflate();
    const pvcNames = created
      .filter(
        resource => resource.type === 'kubernetes:core/v1:PersistentVolumeClaim',
      )
      .map(resource => resource.inputs.metadata.name);

    const persistence = release!.inputs.values.persistence;
    expect(persistence.config.existingClaim).toBe('jellyfin-config');
    expect(persistence.media.existingClaim).toBe('jellyfin-media');
    expect(persistence.cache.existingClaim).toBe('jellyfin-cache');
    for (const claim of Object.values(persistence) as Array<{
      existingClaim: string;
    }>) {
      expect(pvcNames).toContain(claim.existingClaim);
    }
  });

  test('single GPU: requests 1 GPU and never surges a second Pod', async () => {
    const { release } = await inflate();
    const values = release!.inputs.values;

    expect(values.runtimeClassName).toBe('nvidia');
    expect(values.resources.requests['nvidia.com/gpu']).toBe('1');
    expect(values.resources.limits['nvidia.com/gpu']).toBe('1');
    expect(values.deploymentStrategy).toEqual({
      type: 'RollingUpdate',
      rollingUpdate: { maxSurge: 0, maxUnavailable: 1 },
    });
  });
});
