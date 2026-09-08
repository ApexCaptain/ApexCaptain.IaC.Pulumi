import * as pulumi from '@pulumi/pulumi';

const UNWRAP_TIMEOUT_MS = 5000;

export function unwrap<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `unwrap timed out after ${UNWRAP_TIMEOUT_MS}ms: Output never resolved`,
        ),
      );
    }, UNWRAP_TIMEOUT_MS);

    output.apply(value => {
      clearTimeout(timeout);
      resolve(value);
      return value;
    });
  });
}

export function installPulumiMocks(option?: {
  onNewResource?: (args: pulumi.runtime.MockResourceArgs) => void;
  stateOverrides?: (
    args: pulumi.runtime.MockResourceArgs,
  ) => Record<string, unknown>;
}): void {
  void pulumi.runtime.setMocks(
    {
      newResource: (args: pulumi.runtime.MockResourceArgs) => {
        option?.onNewResource?.(args);
        const overrides = option?.stateOverrides?.(args) ?? {};
        return {
          id: `${args.name}-id`,
          state: {
            ...args.inputs,
            ...overrides,
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
