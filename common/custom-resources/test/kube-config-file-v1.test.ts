import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

let previousKubeDir: string | undefined;
let tmpKubeDir: string;

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
});

describe('KubeConfigFileV1', () => {
  beforeEach(() => {
    created.length = 0;
    previousKubeDir = process.env.PULUMI_GENERATED_KUBECONFIG_DIR_PATH;
    tmpKubeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeconfig-'));
    process.env.PULUMI_GENERATED_KUBECONFIG_DIR_PATH = tmpKubeDir;
  });

  afterEach(() => {
    if (previousKubeDir === undefined) {
      delete process.env.PULUMI_GENERATED_KUBECONFIG_DIR_PATH;
    } else {
      process.env.PULUMI_GENERATED_KUBECONFIG_DIR_PATH = previousKubeDir;
    }
    fs.rmSync(tmpKubeDir, { recursive: true, force: true });
  });

  test('create payload is kubeconfig YAML and does not write to disk', async () => {
    const { KubeConfigFileV1 } = await import(
      '../src/resources/k8s/kube-config-file.v1.res'
    );

    const file = new KubeConfigFileV1('unit-kubeconfig', {
      name: 'workstation',
      cluster: {
        certificateAuthorityData: '-----BEGIN CERTIFICATE-----\nunit\n-----END CERTIFICATE-----',
        server: 'https://127.0.0.1:6443',
      },
    });

    await unwrap(file.filePath);
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

    expect(createCommand).toContain('apiVersion: v1');
    expect(createCommand).toContain('kind: Config');
    expect(createCommand).toContain('https://127.0.0.1:6443');
    expect(createCommand).toContain(`${tmpKubeDir}/workstation.yaml`);

    expect(fs.existsSync(path.join(tmpKubeDir, 'workstation.yaml'))).toBe(
      false,
    );
  });
});
