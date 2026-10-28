import * as testing from '@common/utils/src/testing';

export { unwrap } from '@common/utils/src/testing';

export function installPulumiMocks(
  option?: testing.InstallPulumiMocksOption,
): void {
  testing.installPulumiMocks({
    project: 'nexus-unit',
    stack: 'dev',
    organization: 'test-org',
    ...option,
    callResult: args => {
      const custom = option?.callResult?.(args);
      if (custom) {
        return custom;
      }
      // @pulumi/std md5 — Contract hash path uses `.result`
      if (args.token.toLowerCase().includes('md5')) {
        return { result: 'mock-md5-hash' };
      }
      return undefined;
    },
  });
}
