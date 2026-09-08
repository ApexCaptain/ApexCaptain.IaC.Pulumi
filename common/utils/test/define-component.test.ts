import * as pulumi from '@pulumi/pulumi';

const createdResources: Array<{ type: string; name: string }> = [];

void pulumi.runtime.setMocks(
  {
    newResource: (args: pulumi.runtime.MockResourceArgs) => {
      createdResources.push({
        type: args.type,
        name: args.name,
      });

      return {
        id: `${args.name}-id`,
        state: args.inputs,
      };
    },
    call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
  },
  'utils-unit',
  'test',
  false,
);

function unwrap<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise(resolve => {
    output.apply(value => {
      resolve(value);
      return value;
    });
  });
}

describe('defineComponent', () => {
  test('registers output and secret from inflate', async () => {
    const { defineComponent } = await import(
      '../src/functions/define-component.function'
    );

    const Probe = defineComponent<{ marker: string }, { marker: string }, object>(
      'unit:probe:v1',
      args => ({
        output: pulumi.output({ marker: args.marker }),
        secret: pulumi.output({}),
      }),
    );

    const probe = new Probe('probe', { marker: 'ok' });
    await expect(unwrap(probe.output)).resolves.toEqual({ marker: 'ok' });
    await expect(unwrap(probe.secret)).resolves.toEqual({});
    expect(createdResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'Component:unit:probe:v1',
          name: 'probe',
        }),
      ]),
    );
  });
});
