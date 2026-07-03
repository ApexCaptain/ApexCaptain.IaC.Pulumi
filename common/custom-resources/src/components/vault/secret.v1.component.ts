import { authentik } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
import dedent from 'dedent';
import { flatten } from 'flat';
import _ from 'lodash';

type SecretV1 = {
  [key: string]: string | number | boolean | null | undefined | SecretV1;
};

interface SecretV1ComponentArgsShape {
  oidcMountAccessor: string;
  kvMount: string;
  paths: string[];
  secrets: {
    shared: SecretV1;
    developer: SecretV1;
    runtime: SecretV1;
  };
  providers: {
    authentik: authentik.Provider;
    vault: vault.Provider;
  };
}

export type SecretV1ComponentArgs =
  utils.types.DeepPulumiInput<SecretV1ComponentArgsShape>;

export const SecretV1Component = utils.functions.defineComponent(
  'vault:secret:v1',
  (
    args: SecretV1ComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const secretName = pulumi
      .output(args.paths)
      .apply(resolvedPaths => resolvedPaths.join('-').toLocaleLowerCase());
    const secretsDirPath = pulumi
      .output(args.paths)
      .apply(resolvedPaths => resolvedPaths.join('/').toLocaleLowerCase());
    const sharedSecretPath = pulumi.interpolate`${secretsDirPath}/shared`;
    const developerSecretPath = pulumi.interpolate`${secretsDirPath}/developer`;
    const runtimeSecretPath = pulumi.interpolate`${secretsDirPath}/runtime`;

    // External Developer Identity
    if (pulumi.getStack() != utils.enums.StackStage.PROD) {
      const developerGroupName = pulumi.interpolate`developer-${secretName}`;

      const authentikDeveloperGroup = new authentik.Group(
        `${resourceName}-authentikDeveloperGroup`,
        {
          name: developerGroupName,
        },
        {
          ...opts,
          provider: args.providers.authentik,
        },
      );

      const vaultDeveloperPolicy = new vault.Policy(
        `${resourceName}-vaultDeveloperPolicy`,
        {
          name: pulumi.interpolate`read-policy-${secretName}`,
          policy: pulumi
            .all([
              args.paths,
              args.kvMount,
              sharedSecretPath,
              developerSecretPath,
            ])
            .apply(
              ([
                resolvedPaths,
                resolvedKvMount,
                resolvedSharedSecretPath,
                resolvedDeveloperSecretPath,
              ]) => {
                const segments = resolvedPaths
                  .map(segment => segment.toLocaleLowerCase())
                  .filter(Boolean);

                return dedent`
                  path "${resolvedKvMount}/metadata/" {
                    capabilities = ["list"]
                  }
                  ${segments
                    .map((__, index) => {
                      const prefix = segments.slice(0, index + 1).join('/');
                      return dedent`
                        path "${resolvedKvMount}/metadata/${prefix}" {
                          capabilities = ["list"]
                        }
                      `;
                    })
                    .join('\n')}

                  path "${resolvedKvMount}/data/${resolvedSharedSecretPath}" {
                    capabilities = ["read"]
                  }
                  path "${resolvedKvMount}/metadata/${resolvedSharedSecretPath}" {
                    capabilities = ["read"]
                  }
                  path "${resolvedKvMount}/data/${resolvedDeveloperSecretPath}" {
                    capabilities = ["read"]
                  }
                  path "${resolvedKvMount}/metadata/${resolvedDeveloperSecretPath}" {
                    capabilities = ["read"]
                  }
                `;
              },
            ),
        },
        {
          ...opts,
          provider: args.providers.vault,
        },
      );

      const vaultDeveloperGroup = new vault.identity.Group(
        `${resourceName}-vaultDeveloperGroup`,
        {
          name: developerGroupName,
          type: 'external',
          policies: [vaultDeveloperPolicy.name],
          metadata: {
            projectPath: secretsDirPath,
            stage: pulumi.getStack() as utils.enums.StackStage,
          },
        },
        {
          ...opts,
          provider: args.providers.vault,
          dependsOn: [vaultDeveloperPolicy],
        },
      );

      const valutGroupAlias = new vault.identity.GroupAlias(
        `${resourceName}-vaultGroupAlias`,
        {
          name: developerGroupName,
          mountAccessor: args.oidcMountAccessor,
          canonicalId: vaultDeveloperGroup.id,
        },
        {
          ...opts,
          provider: args.providers.vault,
          dependsOn: [vaultDeveloperGroup],
        },
      );
    }

    // Secrets
    const sharedSecret = new vault.kv.SecretV2(
      `${resourceName}-sharedSecret`,
      {
        mount: args.kvMount,
        name: sharedSecretPath,
        dataJson: pulumi.output(args.secrets.shared).apply(resolvedSecret =>
          JSON.stringify(
            flatten(resolvedSecret, {
              delimiter: '_',
            }),
          ),
        ),
        deleteAllVersions: true,
        customMetadata: {
          maxVersions: 10,
          data: {
            stack: pulumi.getStack(),
          },
        },
      },
      {
        ...opts,
        provider: args.providers.vault,
      },
    );

    const developerSecret = new vault.kv.SecretV2(
      `${resourceName}-developerSecret`,
      {
        mount: args.kvMount,
        name: developerSecretPath,
        dataJson: pulumi.output(args.secrets.developer).apply(resolvedSecret =>
          JSON.stringify(
            flatten(resolvedSecret, {
              delimiter: '_',
            }),
          ),
        ),
        deleteAllVersions: true,
        customMetadata: {
          maxVersions: 10,
          data: {
            stack: pulumi.getStack(),
          },
        },
      },
      {
        ...opts,
        provider: args.providers.vault,
      },
    );

    const runtimeSecret = new vault.kv.SecretV2(
      `${resourceName}-runtimeSecret`,
      {
        mount: args.kvMount,
        name: runtimeSecretPath,
        dataJson: pulumi.output(args.secrets.runtime).apply(resolvedSecret =>
          JSON.stringify(
            flatten(resolvedSecret, {
              delimiter: '_',
            }),
          ),
        ),
        deleteAllVersions: true,
        customMetadata: {
          maxVersions: 10,
          data: {
            stack: pulumi.getStack(),
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
