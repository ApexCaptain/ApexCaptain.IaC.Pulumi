import { coderd } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';

interface CoderResourcesComponentArgsShape {
  providers: {
    coderd: coderd.Provider;
  };
}

export type CoderResourcesComponentArgs =
  utils.types.DeepPulumiInput<CoderResourcesComponentArgsShape>;

export const CoderResourcesComponent = utils.functions.defineComponent(
  'coder-resources',
  (
    args: CoderResourcesComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
