import * as pulumi from '@pulumi/pulumi';

export function unwrap<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise(resolve => {
    output.apply(value => {
      resolve(value);
      return value;
    });
  });
}

export function installPulumiMocks(option?: {
  onNewResource?: (args: pulumi.runtime.MockResourceArgs) => void;
}): void {
  void pulumi.runtime.setMocks(
    {
      newResource: (args: pulumi.runtime.MockResourceArgs) => {
        option?.onNewResource?.(args);
        return {
          id: `${args.name}-id`,
          state: {
            ...args.inputs,
            privateKeyOpenssh: 'mock-openssh',
            privateKeyPem: 'mock-pem',
            publicKeyOpenssh: 'mock-pub-openssh',
            publicKeyPem: 'mock-pub-pem',
            result: args.inputs.result ?? `${args.name}-id`,
          },
        };
      },
      call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
    },
    'custom-resources-unit',
    'test',
    false,
  );
}
