import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
  stateOverrides: args => {
    const type = args.type.toLowerCase();
    if (type.includes('secretbackendca') || type.includes('ssh')) {
      return {
        publicKey: 'ssh-ed25519 AAAAC3-mock-ca',
      };
    }
    if (type.includes('secret') && type.includes('core')) {
      return {
        data: {
          'ca.crt': Buffer.from('mock-ca').toString('base64'),
        },
      };
    }
    return {};
  },
});

const baseArgs = () => ({
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
  hostPrincipals: ['sftp.example.com'],
  issuerGroupName: 'System Manager' as const,
  issuerIdentityGroupId: 'identity-group-id',
  userCaMount: 'ssh-user-ca',
  hostCaMount: 'ssh-host-ca',
  kvMount: 'secret',
  slackWebhookUrl: 'https://hooks.slack.com/services/mock',
  vaultConnectionRef: 'vault-secrets-operator/vault',
  kubernetesAuthMountPath: 'kubernetes',
  vault: {
    address: 'https://vault.vault.svc:8200',
    tlsServerName: 'vault.vault.svc',
    ca: {
      namespace: 'vault',
      secretName: 'vault-ca',
    },
  },
});

describe('SftpV3Component', () => {
  beforeEach(() => {
    created.length = 0;
  });

  test('registers adapter:sftp:v3 without tls keys, PQC sshd, or user private in VSO', async () => {
    const kubernetes = await import('@pulumi/kubernetes');
    const vault = await import('@pulumi/vault');
    const { SftpV3Component } = await import(
      '../src/components/adapter/sftp.v3.component'
    );

    const k8sProvider = new kubernetes.Provider('unit-sftp-v3-k8s', {
      kubeconfig: '{}',
    });
    const vaultProvider = new vault.Provider('unit-sftp-v3-vault', {
      address: 'http://127.0.0.1:8200',
    });

    const sftp = new SftpV3Component('unit-sftp-v3', {
      ...baseArgs(),
      providers: {
        kubernetes: k8sProvider,
        vault: vaultProvider,
      },
    });

    const output = await unwrap(sftp.output);
    await new Promise(r => setImmediate(r));

    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'Component:adapter:sftp:v3',
          name: 'unit-sftp-v3',
        }),
      ]),
    );

    const tlsPrivateKeys = created.filter(
      resource =>
        resource.type.toLowerCase().includes('privatekey') &&
        !resource.type.toLowerCase().startsWith('component'),
    );
    expect(tlsPrivateKeys).toHaveLength(0);

    const cronJobs = created.filter(resource =>
      resource.type.toLowerCase().includes('cronjob'),
    );
    expect(cronJobs).toHaveLength(2);
    const schedules = cronJobs.map(job => job.inputs.spec.schedule).sort();
    expect(schedules).toEqual(['0 3 * * *', '0 3 1 1,4,7,10 *'].sort());
    for (const cronJob of cronJobs) {
      expect(cronJob.inputs.spec.timeZone).toBe('Asia/Seoul');
    }

    const configMap = created.find(
      resource =>
        resource.type.toLowerCase().includes('configmap') &&
        !resource.type.toLowerCase().includes('vault'),
    );
    expect(configMap).toBeDefined();
    const sshdConfig = String(configMap!.inputs.data.sshd_config);
    expect(sshdConfig).not.toContain('mlkem768');
    expect(sshdConfig).not.toContain('HostCertificate');
    expect(sshdConfig).not.toContain('TrustedUserCAKeys');
    expect(sshdConfig).not.toContain('KexAlgorithms');
    expect(sshdConfig).toContain('PasswordAuthentication no');
    expect(sshdConfig).toContain('HostKeyAlgorithms ssh-ed25519');
    expect(sshdConfig).toContain('PubkeyAcceptedAlgorithms ssh-ed25519');
    expect(configMap!.inputs.data.trusted_user_ca_keys).toBeUndefined();

    const vsoSecrets = created.filter(
      resource => resource.inputs.kind === 'VaultStaticSecret',
    );
    expect(vsoSecrets.length).toBeGreaterThanOrEqual(2);
    const userVso = vsoSecrets.find(resource => {
      const excludes =
        resource.inputs.spec?.destination?.transformation?.excludes ?? [];
      return (
        Array.isArray(excludes) &&
        excludes.includes('current_private') &&
        excludes.includes('previous_private')
      );
    });
    expect(userVso).toBeDefined();

    const slackSecret = created.find(
      resource =>
        resource.type.toLowerCase().includes('secret') &&
        resource.type.toLowerCase().includes('core') &&
        JSON.stringify(resource.inputs).includes('hooks.slack.com'),
    );
    expect(slackSecret).toBeDefined();
    expect(slackSecret!.type.toLowerCase()).not.toContain('configmap');

    const sshRoles = created.filter(resource =>
      resource.type.toLowerCase().includes('secretbackendrole'),
    );
    expect(sshRoles).toHaveLength(2);
    const ttls = sshRoles.map(role => role.inputs.ttl).sort();
    expect(ttls).toEqual(['86400', '864000'].sort());
    for (const role of sshRoles) {
      expect(role.inputs.maxTtl).toBe(role.inputs.ttl);
    }

    const humanPolicy = created.find(resource => {
      const policy = String(resource.inputs.policy ?? '');
      return (
        resource.type.toLowerCase().includes('policy') &&
        policy.includes('/user') &&
        policy.includes('read') &&
        !policy.includes('/issue/')
      );
    });
    expect(humanPolicy).toBeDefined();
    const humanPolicyText = String(humanPolicy!.inputs.policy);
    expect(humanPolicyText).toContain('path "secret/metadata/sftp"');
    expect(humanPolicyText).toContain('path "secret/metadata/sftp/"');
    expect(humanPolicyText).toContain(
      'path "secret/metadata/sftp/media/unit-sftp-v-3"',
    );
    expect(humanPolicyText).not.toContain('path "secret/metadata/*"');
    expect(humanPolicyText).not.toContain(
      'secret/data/sftp/media/unit-sftp-v-3/host',
    );

    const groupPolicies = created.find(resource =>
      resource.type.toLowerCase().includes('grouppolicies'),
    );
    expect(groupPolicies).toBeDefined();
    expect(groupPolicies!.inputs.exclusive).toBe(false);

    expect(output.userKvPath).toContain('sftp/media/');
    expect(output.userKvPath).toContain('/user');
    expect(output.hostKvPath).toContain('/host');
    expect(output.reloaderAnnotation).toContain(
      'secret.reloader.stakater.com/reload:',
    );
    expect(output.reloaderAnnotation).toContain(output.userSecretName);
    expect(output.spec.volumeSpecs.length).toBeGreaterThanOrEqual(4);

    const sidecarArgs = JSON.stringify(output.spec.containerSpec.args ?? []);
    expect(sidecarArgs).toContain('echo >>');
    expect(sidecarArgs).not.toContain('ssh_host_ed25519_key-cert');
    expect(sidecarArgs).not.toContain('printf');
    expect(sidecarArgs).toContain('exec /entrypoint');

    const bootstrapJob = created.find(resource => {
      const type = resource.type.toLowerCase();
      return type.includes('job') && !type.includes('cron');
    });
    expect(bootstrapJob).toBeDefined();
    const jobJson = JSON.stringify(
      bootstrapJob!.inputs.spec.template.spec.containers,
    );
    expect(jobJson).toContain('key_type=ed25519');
    expect(jobJson).toContain('SFTP_JOB_MODE');
    // Vault SSH issue 응답은 private_key + signed_key. public_key는 없음.
    expect(jobJson).toContain('ssh-keygen -y');
    expect(jobJson).toContain('openssh-keygen');
    expect(jobJson).not.toContain('.data.public_key');
  });
});
