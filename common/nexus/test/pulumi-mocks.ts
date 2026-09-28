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
  project?: string;
  stack?: string;
  organization?: string;
  onNewResource?: (args: pulumi.runtime.MockResourceArgs) => void;
  onCall?: (args: pulumi.runtime.MockCallArgs) => void;
  stateOverrides?: (
    args: pulumi.runtime.MockResourceArgs,
  ) => Record<string, unknown>;
  callResult?: (
    args: pulumi.runtime.MockCallArgs,
  ) => Record<string, unknown> | undefined;
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
      call: (args: pulumi.runtime.MockCallArgs) => {
        option?.onCall?.(args);
        const custom = option?.callResult?.(args);
        if (custom) {
          return custom;
        }
        // @pulumi/std md5 — Contract hash path uses `.result`
        if (args.token.toLowerCase().includes('md5')) {
          return { result: 'mock-md5-hash' };
        }
        return args.inputs;
      },
    },
    option?.project ?? 'nexus-unit',
    option?.stack ?? 'dev',
    false,
    option?.organization ?? 'test-org',
  );
}
