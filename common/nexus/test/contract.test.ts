import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

// flat@6는 ESM 전용. Contract → @common/custom-resources 배럴 import가 secret.v1을 끌어옴.
jest.mock('flat', () => ({
  flatten: (obj: Record<string, unknown>) => obj,
}));

const CALLER_PROJECT = 'nexus-unit';
const ORG = 'test-org';
const STACK = 'dev';

const created: pulumi.runtime.MockResourceArgs[] = [];
const stackReferenceOutputs = {
  output: { fromRef: true },
  secret: { token: 'ref-secret' },
};

installPulumiMocks({
  project: CALLER_PROJECT,
  stack: STACK,
  organization: ORG,
  onNewResource: args => {
    created.push(args);
  },
  stateOverrides: args => {
    if (args.type === 'pulumi:pulumi:StackReference') {
      return { outputs: stackReferenceOutputs };
    }
    return {};
  },
});

function makeFixture(option: {
  projectName: string;
  stageYamls?: string[];
}): { root: string; srcFile: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-contract-'));
  fs.writeFileSync(
    path.join(root, 'Pulumi.yaml'),
    `name: ${option.projectName}\nruntime: nodejs\n`,
    'utf8',
  );
  for (const stage of option.stageYamls ?? ['dev']) {
    fs.writeFileSync(path.join(root, `Pulumi.${stage}.yaml`), '{}\n', 'utf8');
  }
  const srcDir = path.join(root, 'src');
  fs.mkdirSync(srcDir);
  const srcFile = path.join(srcDir, 'index.ts');
  fs.writeFileSync(srcFile, '// fixture\n', 'utf8');
  return { root, srcFile };
}

describe('Contract', () => {
  let hashDir: string;
  let fixtures: string[] = [];

  beforeEach(() => {
    created.length = 0;
    hashDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-hash-'));
    process.env.PULUMI_CONTRACT_HASH_DIR_PATH = hashDir;
    fixtures = [];
  });

  afterEach(() => {
    delete process.env.PULUMI_CONTRACT_HASH_DIR_PATH;
    fs.rmSync(hashDir, { recursive: true, force: true });
    for (const dir of fixtures) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('throws when Pulumi.yaml is not found walking up from callerPath', async () => {
    const { Contract } = await import('../src/classes/contract');
    const orphan = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-orphan-'));
    fixtures.push(orphan);
    const leaf = path.join(orphan, 'deep', 'leaf');
    fs.mkdirSync(leaf, { recursive: true });

    expect(
      () =>
        new Contract(leaf, () => ({
          output: pulumi.output({}),
          secret: pulumi.output({}),
        })),
    ).toThrow(/Pulumi.yaml not found/);
  });

  test('throws when Pulumi.yaml has no name field', async () => {
    const { Contract } = await import('../src/classes/contract');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-noname-'));
    fixtures.push(root);
    fs.writeFileSync(path.join(root, 'Pulumi.yaml'), 'runtime: nodejs\n', 'utf8');
    fs.writeFileSync(path.join(root, 'Pulumi.dev.yaml'), '{}\n', 'utf8');

    expect(
      () =>
        new Contract(root, () => ({
          output: pulumi.output({}),
          secret: pulumi.output({}),
        })),
    ).toThrow(/Pulumi.yaml "name" field not found/);
  });

  test('same-stack mode inflates output/secret and creates hash TextFile resources', async () => {
    const { root, srcFile } = makeFixture({ projectName: CALLER_PROJECT });
    fixtures.push(root);

    const { Contract } = await import('../src/classes/contract');

    const contract = new Contract(srcFile, () => ({
      output: pulumi.output({ kind: 'local' }),
      secret: pulumi.secret({ pass: 'x' }),
    }));

    await expect(unwrap(contract.output)).resolves.toEqual({ kind: 'local' });
    await expect(unwrap(contract.secret)).resolves.toEqual({ pass: 'x' });

    // allow resource registration to flush
    await new Promise(r => setImmediate(r));

    const hashFiles = created.filter(
      r =>
        r.name === 'outputHashFile' ||
        r.name === 'secretHashFile' ||
        r.type.toLowerCase().includes('command'),
    );
    expect(
      created.some(r => r.name === 'outputHashFile') ||
        created.some(r => r.type.toLowerCase().includes('command')),
    ).toBe(true);
    expect(hashFiles.length).toBeGreaterThan(0);

    const stackRefs = created.filter(
      r => r.type === 'pulumi:pulumi:StackReference',
    );
    expect(stackRefs).toHaveLength(1);
    expect(stackRefs[0].name).toBe(`${ORG}/${CALLER_PROJECT}/${STACK}`);
  });

  test('stack-reference mode uses requireOutput and skips hash files', async () => {
    const remoteProject = 'remote-infra';
    const { root, srcFile } = makeFixture({ projectName: remoteProject });
    fixtures.push(root);

    const { Contract } = await import('../src/classes/contract');

    const contract = new Contract(srcFile, () => {
      throw new Error('inflate must not run in stack-reference mode');
    });

    await expect(unwrap(contract.output)).resolves.toEqual(
      stackReferenceOutputs.output,
    );
    await expect(unwrap(contract.secret)).resolves.toEqual(
      stackReferenceOutputs.secret,
    );

    await new Promise(r => setImmediate(r));

    expect(created.some(r => r.name === 'outputHashFile')).toBe(false);
    expect(created.some(r => r.name === 'secretHashFile')).toBe(false);

    const stackRefs = created.filter(
      r => r.type === 'pulumi:pulumi:StackReference',
    );
    expect(stackRefs).toHaveLength(1);
    expect(stackRefs[0].name).toBe(`${ORG}/${remoteProject}/${STACK}`);
  });

  test('stack-reference id uses prod fallback when only Pulumi.prod.yaml exists', async () => {
    const remoteProject = 'fallback-infra';
    const { root, srcFile } = makeFixture({
      projectName: remoteProject,
      stageYamls: ['prod'],
    });
    fixtures.push(root);

    const { Contract } = await import('../src/classes/contract');

    new Contract(srcFile, () => {
      throw new Error('inflate must not run');
    });

    await new Promise(r => setImmediate(r));

    const stackRefs = created.filter(
      r => r.type === 'pulumi:pulumi:StackReference',
    );
    expect(stackRefs).toHaveLength(1);
    expect(stackRefs[0].name).toBe(`${ORG}/${remoteProject}/prod`);
  });
});
