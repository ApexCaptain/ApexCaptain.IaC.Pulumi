import path from 'node:path';
import { authentik } from '@common/bridged-provider';
import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';

interface DobbyVaultComponentArgsShape {
  oidcMountAccessor: string;
  kvMount: string;
  providers: {
    authentik: authentik.Provider;
    vault: vault.Provider;
  };
}

export type DobbyVaultComponentArgs =
  utils.types.DeepPulumiInput<DobbyVaultComponentArgsShape>;

export const DobbyVaultComponent = utils.functions.defineComponent(
  'dobbyVault',
  async (
    args: DobbyVaultComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const projectName = 'dobby';
    const dobbyChoremanPaths = [projectName, 'choreman', pulumi.getStack()];
    const dobbyChoremanSecretDirPath = dobbyChoremanPaths.join('/');
    const dobbyChoremanDeveloperIdentityName = dobbyChoremanPaths.join('-');

    if (pulumi.getStack() != utils.enums.StackStage.PROD) {
      new customResources.components.secrets.DeveloperIdentityV1Component(
        `${resourceName}-dobbyChoremanDeveloperIdentity`,
        {
          name: dobbyChoremanDeveloperIdentityName,
          secretDirPath: dobbyChoremanSecretDirPath,
          oidcMountAccessor: args.oidcMountAccessor,
          kvMount: args.kvMount,
          providers: {
            authentik: args.providers.authentik,
            vault: args.providers.vault,
          },
        },
      );
    }

    // Testing...
    const testSecret = new vault.kv.SecretV2(
      `${resourceName}-testSecret`,
      {
        mount: args.kvMount,
        name: path.join(dobbyChoremanSecretDirPath, 'test'),
        dataJson: JSON.stringify({
          some: 'qwer',
        }),
        customMetadata: {
          maxVersions: 10,
          data: {
            stack: pulumi.getStack(),
            project: projectName,
          },
        },
      },
      {
        ...opts,
        provider: args.providers.vault,
      },
    );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
