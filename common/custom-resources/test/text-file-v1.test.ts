import * as pulumi from '@pulumi/pulumi';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

const created: pulumi.runtime.MockResourceArgs[] = [];

installPulumiMocks({
  onNewResource: args => {
    created.push(args);
  },
});

describe('TextFileV1', () => {
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
});
