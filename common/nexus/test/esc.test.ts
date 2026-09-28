import { StackStage } from '@common/utils/src/enums/stack-stage.enum';
import { z } from 'zod';
import { AbstractEsc } from '../src/abstract/esc.abstract';

const testEscSchema = z
  .object({
    name: z.string(),
    tags: z.array(z.string()),
    nested: z
      .object({
        enabled: z.boolean(),
      })
      .required(),
  })
  .required();

class TestEsc extends AbstractEsc<typeof testEscSchema> {
  constructor() {
    super('unit-test-esc', testEscSchema);
  }
}

function makeEscClientMock() {
  return {
    createEnvironment: jest.fn(async () => undefined),
    updateEnvironment: jest.fn(async () => undefined),
  };
}

describe('AbstractEsc.upsertEsc', () => {
  test('deep-merges defaultSecret and stageSecrets then updates ESC', async () => {
    const esc = new TestEsc();
    const client = makeEscClientMock();

    await esc.upsertEsc(
      'test-org',
      client as never,
      {
        name: 'base',
        tags: ['b', 'a'],
        nested: { enabled: false },
      },
      {
        [StackStage.DEV]: {
          tags: ['a', 'c'],
          nested: { enabled: true },
        },
      },
    );

    expect(client.createEnvironment).toHaveBeenCalledWith(
      'test-org',
      'unit-test-esc',
      StackStage.DEV,
    );
    expect(client.updateEnvironment).toHaveBeenCalledTimes(1);
    expect(client.updateEnvironment).toHaveBeenCalledWith(
      'test-org',
      'unit-test-esc',
      StackStage.DEV,
      {
        values: {
          pulumiConfig: {
            'unit-test-esc': {
              name: 'base',
              tags: ['a', 'b', 'c'],
              nested: { enabled: true },
            },
          },
        },
      },
    );
  });

  test('throws Zod validation error when merged secret is invalid', async () => {
    const esc = new TestEsc();
    const client = makeEscClientMock();

    await expect(
      esc.upsertEsc(
        'test-org',
        client as never,
        {
          name: 'base',
          tags: ['a'],
          nested: { enabled: true },
        },
        {
          [StackStage.PROD]: {
            // name must stay string — force invalid type after merge intent
            name: 123 as unknown as string,
          },
        },
      ),
    ).rejects.toThrow(/Invalid secret for test-org\/unit-test-esc\/prod/);

    expect(client.updateEnvironment).not.toHaveBeenCalled();
  });

  test('getEscNameWithStage formats name/stage', () => {
    const esc = new TestEsc();
    expect(esc.getEscNameWithStage(StackStage.PROD)).toBe(
      'unit-test-esc/prod',
    );
  });
});
