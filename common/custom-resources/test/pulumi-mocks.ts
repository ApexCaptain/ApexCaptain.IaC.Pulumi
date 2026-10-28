import * as testing from '@common/utils/src/testing';

export { unwrap } from '@common/utils/src/testing';

export function installPulumiMocks(
  option?: Pick<
    testing.InstallPulumiMocksOption,
    'onNewResource' | 'stateOverrides'
  >,
): void {
  testing.installPulumiMocks({
    ...option,
    project: 'custom-resources-unit',
    stack: 'test',
  });
}
