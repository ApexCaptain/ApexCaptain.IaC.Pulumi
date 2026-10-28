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

const pvcArgs = (storageClass: string, size: string) => ({
  storageClass,
  size,
});

async function inflate() {
  const kubernetes = await import('@pulumi/kubernetes');
  const vault = await import('@pulumi/vault');
  const { QbittorrentAppComponent } = await import(
    '../src/components/qbittorrent/qbittorrent.app.component'
  );

  const recorder = createResourceOptionsRecorder();
  const qbittorrent = new QbittorrentAppComponent(
    'unit-qbittorrent',
    {
      nordLynx: {
        allowedCidrBlocks: ['10.0.0.0/16'],
        privateKey: 'mock-wireguard-key',
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
        qbitorrentSftp: { port: 2222 },
      },
      pvc: {
        qbittorrentModCache: pvcArgs('longhorn-ssd', '100Mi'),
        qbittorrentConfig: pvcArgs('longhorn-ssd', '200Mi'),
        qbittorrentCompleteDownloads: pvcArgs('longhorn-hdd', '1Ti'),
        qbittorrentIncompleteDownloads: pvcArgs('longhorn-ssd', '300Gi'),
      },
      providers: {
        kubernetes: new kubernetes.Provider('unit-k8s', { kubeconfig: '{}' }),
        vault: new vault.Provider('unit-vault', {
          address: 'http://127.0.0.1:8200',
        }),
      },
    },
    { transformations: [recorder.transformation] },
  );

  await unwrap(qbittorrent.output);
  await settle(() => created.length);
  return recorder;
}

describe('QbittorrentAppComponent', () => {
  test('protects only namespace and PVCs whose loss is not recoverable', async () => {
    const recorder = await inflate();

    const protectedNames = [...recorder.options.entries()]
      .filter(([, { opts }]) => opts.protect === true)
      .map(([name]) => name)
      .sort();

    // modcache·incomplete는 재생성 가능하므로 의도적으로 제외
    expect(protectedNames).toEqual(
      [
        'unit-qbittorrent-namespace',
        'unit-qbittorrent-qbittorrentConfigPvc',
        'unit-qbittorrent-qbittorrentCompleteDownloadsPvc',
      ].sort(),
    );
    for (const name of protectedNames) {
      expect(recorder.options.get(name)!.opts.retainOnDelete).toBe(true);
    }
  });

  test('keeps namespace out of Istio ambient (WireGuard routing)', async () => {
    created.length = 0;
    await inflate();

    const namespace = created.find(
      resource => resource.type === 'kubernetes:core/v1:Namespace',
    );
    expect(namespace?.inputs.metadata.labels).toMatchObject({
      'istio.io/dataplane-mode': 'none',
    });
  });

  test('PVC sizes and storage classes follow args', async () => {
    created.length = 0;
    await inflate();

    const pvcs = Object.fromEntries(
      created
        .filter(
          resource =>
            resource.type === 'kubernetes:core/v1:PersistentVolumeClaim',
        )
        .map(resource => [
          resource.inputs.metadata.name,
          {
            storageClass: resource.inputs.spec.storageClassName,
            size: resource.inputs.spec.resources.requests.storage,
          },
        ]),
    );
    expect(pvcs).toEqual({
      'qbittorrent-modcache': pvcArgs('longhorn-ssd', '100Mi'),
      'qbittorrent-config': pvcArgs('longhorn-ssd', '200Mi'),
      'qbittorrent-complete-downloads': pvcArgs('longhorn-hdd', '1Ti'),
      'qbittorrent-incomplete-downloads': pvcArgs('longhorn-ssd', '300Gi'),
    });
  });
});
