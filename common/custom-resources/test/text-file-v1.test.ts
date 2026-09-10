import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
});

const sha256Hex = (content: string): string =>
  crypto.createHash('sha256').update(content, 'utf8').digest('hex');

describe('TextFileV1', () => {
  beforeEach(() => {
    created.length = 0;
  });

  test('includes chmod in create when fileMode is valid', async () => {
    const { TextFileV1 } = await import(
      '../src/resources/local/textFile.v1.res'
    );

    const file = new TextFileV1('unit-text', {
      fileDirPath: '/tmp/apex-unit-textfile',
      fileName: 'a.txt',
      content: 'hello',
      fileMode: '600',
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

    expect(createCommand).toContain('chmod 600');
    expect(createCommand).toContain('/tmp/apex-unit-textfile/a.txt');
  });

  test('fileHash is sha256 of args.content even when disk file differs', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'textfile-hash-'));
    const fileName = 'stale.txt';
    const diskContent = 'on-disk-stale';
    const desiredContent = 'desired-from-args';
    fs.writeFileSync(path.join(tmpDir, fileName), diskContent, 'utf8');

    try {
      const { TextFileV1 } = await import(
        '../src/resources/local/textFile.v1.res'
      );

      const file = new TextFileV1('unit-text-hash', {
        fileDirPath: tmpDir,
        fileName,
        content: desiredContent,
      });

      const fileHash = await unwrap(file.fileHash);

      expect(fileHash).toBe(sha256Hex(desiredContent));
      expect(fileHash).not.toBe(sha256Hex(diskContent));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
