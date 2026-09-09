import * as pulumi from '@pulumi/pulumi';

import { toCloudflareRecordFqdn } from '../src/functions/to-cloudflare-record-fqdn.function';

void pulumi.runtime.setMocks(
  {
    newResource: (args: pulumi.runtime.MockResourceArgs) => ({
      id: `${args.name}-id`,
      state: args.inputs,
    }),
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

describe('toCloudflareRecordFqdn', () => {
  test('apex aliases', () => {
    expect(toCloudflareRecordFqdn('@', 'example.com')).toBe('example.com');
    expect(toCloudflareRecordFqdn('example.com', 'example.com')).toBe(
      'example.com',
    );
  });

  test('appends zone when given a subdomain label', () => {
    expect(toCloudflareRecordFqdn('www', 'example.com')).toBe(
      'www.example.com',
    );
  });

  test('keeps an already-qualified name', () => {
    expect(toCloudflareRecordFqdn('www.example.com', 'example.com')).toBe(
      'www.example.com',
    );
  });

  test('unwraps pulumi Output inputs', async () => {
    const fqdn = toCloudflareRecordFqdn(
      pulumi.output('www'),
      pulumi.output('example.com'),
    );

    expect(pulumi.Output.isInstance(fqdn)).toBe(true);
    await expect(unwrap(fqdn as pulumi.Output<string>)).resolves.toBe(
      'www.example.com',
    );
  });
});
