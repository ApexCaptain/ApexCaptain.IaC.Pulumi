import { authentik } from '@common/bridged-provider';
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';

interface PriceQuestVaultComponentArgsShape {
  namespace: string;
  projectName: string;
  vault: {
    oidcMountAccessor: string;
    kvMount: string;
  };
  providers: {
    authentik: authentik.Provider;
    vault: vault.Provider;
  };
}

export type PriceQuestVaultComponentArgs =
  utils.types.DeepPulumiInput<PriceQuestVaultComponentArgsShape>;

export const PriceQuestVaultComponent = utils.functions.defineComponent(
  'priceQuestVault',
  (
    args: PriceQuestVaultComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const apiSecretPaths = [args.projectName, 'api', pulumi.getStack()];
    const apiSecret = new customResources.components.vault.SecretV1Component(
      `${resourceName}-apiSecret`,
      {
        oidcMountAccessor: args.vault.oidcMountAccessor,
        kvMount: args.vault.kvMount,
        paths: apiSecretPaths,
        secrets: {
          shared: {
            qwer: 'asdf',
            some: {
              sharedSecret: 'sharedSecret',
            },
          },
          developer: {
            asdf: 'qwer',
            some: {
              nestedDeveloperSecret: 'nestedDeveloperSecret',
            },
          },
          runtime: {
            zxcv: 'asdf',
            some: {
              nestedRuntimeSecret: 'nestedRuntimeSecret',
            },
          },
        },
        providers: args.providers,
      },
    );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
