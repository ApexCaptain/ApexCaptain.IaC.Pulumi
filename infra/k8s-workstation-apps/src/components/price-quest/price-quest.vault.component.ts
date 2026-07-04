import { authentik } from '@common/bridged-provider';
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
import dedent from 'dedent';

interface PriceQuestVaultComponentArgsShape {
  namespace: string;
  projectName: string;
  vault: {
    oidcMountAccessor: string;
    kvMount: string;
    vaultConnectionRef: string;
    kubernetesAuthMountPath: string;
  };
  providers: {
    authentik: authentik.Provider;
    vault: vault.Provider;
    kubernetes: kubernetes.Provider;
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
    const apiSecret = new customResources.components.vault.SecretV1Component(
      `${resourceName}-apiSecret`,
      {
        oidcMountAccessor: args.vault.oidcMountAccessor,
        kvMount: args.vault.kvMount,
        vaultConnectionRef: args.vault.vaultConnectionRef,
        kubernetesAuthMountPath: args.vault.kubernetesAuthMountPath,
        namespace: args.namespace,
        paths: [args.projectName, 'api', pulumi.getStack()],
        secrets: {
          shared: {},
          developer: {},
          runtime: {},
        },
        providers: {
          kubernetes: args.providers.kubernetes,
          authentik: args.providers.authentik,
          vault: args.providers.vault,
        },
      },
    );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
