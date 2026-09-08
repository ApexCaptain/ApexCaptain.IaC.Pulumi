import * as pulumi from '@pulumi/pulumi';

export async function unwrap<T>(output: pulumi.Output<T>): Promise<T> {
  return await output.promise();
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
