/**
 * Test — Project B 개발자용 Vault dev secret (예시)
 *
 * Project A와 동일 패턴, 리소스·그룹·path는 완전 분리.
 * Bob이 A+B 모두 접근하려면 Authentik에서 두 그룹에 모두 넣으면 된다
 * (Vault는 login 시 groups claim에 있는 alias마다 policy 합산).
 */
import { authentik } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
import dedent from 'dedent';

const projectId = 'project-b';
const developerGroupName = 'project-b-dev';
const policyName = `${projectId}-dev-read`;
const kvMount = 'secret';
const secretPath = `workstation-apps/${projectId}/dev/app`;
const devSecretBasePath = `workstation-apps/${projectId}/dev`;

const devReadPolicyDocument = dedent`
  # ${projectId} — developer dev secrets (OIDC identity group)
  path "${kvMount}/data/${devSecretBasePath}" {
    capabilities = ["read", "list"]
  }
  path "${kvMount}/data/${devSecretBasePath}/*" {
    capabilities = ["read", "list"]
  }
  path "${kvMount}/metadata/${devSecretBasePath}" {
    capabilities = ["read", "list"]
  }
  path "${kvMount}/metadata/${devSecretBasePath}/*" {
    capabilities = ["read", "list"]
  }
`;

interface TestProjectBComponentArgsShape {
  /** Vault OIDC auth mount accessor (`vaultAuthentik` output) */
  oidcMountAccessor: pulumi.Input<string>;
  providers: {
    vault: vault.Provider;
    authentik: authentik.Provider;
  };
}

export type TestProjectBComponentArgs = TestProjectBComponentArgsShape;

export const TestProjectBComponent = utils.functions.defineComponent(
  'testProjectB',
  (
    args: TestProjectBComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const vaultProviderOpts = { ...opts, provider: args.providers.vault };
    const authentikProviderOpts = {
      ...opts,
      provider: args.providers.authentik,
    };

    const developerGroup = new authentik.Group(
      `${resourceName}-developerGroup`,
      {
        name: developerGroupName,
      },
      authentikProviderOpts,
    );

    const devReadPolicy = new vault.Policy(
      `${resourceName}-devReadPolicy`,
      {
        name: policyName,
        policy: devReadPolicyDocument,
      },
      vaultProviderOpts,
    );

    const developerIdentityGroup = new vault.identity.Group(
      `${resourceName}-developerIdentityGroup`,
      {
        name: developerGroupName,
        type: 'external',
        policies: [policyName],
        metadata: {
          project: projectId,
          tier: 'dev',
        },
      },
      {
        ...vaultProviderOpts,
        dependsOn: [devReadPolicy],
      },
    );

    new vault.identity.GroupAlias(
      `${resourceName}-developerGroupAlias`,
      {
        name: developerGroupName,
        mountAccessor: args.oidcMountAccessor,
        canonicalId: developerIdentityGroup.id,
      },
      {
        ...vaultProviderOpts,
        dependsOn: [developerIdentityGroup],
      },
    );

    new vault.kv.SecretV2(
      `${resourceName}-appDevSecret`,
      {
        mount: kvMount,
        name: secretPath,
        dataJson: JSON.stringify({
          DATABASE_URL:
            'postgresql://project_b_app:dev-only@postgres.dev.local:5432/project_b',
          API_KEY: 'dev-sandbox-project-b-replace-via-rotation',
        }),
        customMetadata: {
          maxVersions: 10,
          data: {
            environment: 'dev',
            project: projectId,
            managed_by: 'pulumi',
          },
        },
      },
      vaultProviderOpts,
    );

    return {
      output: pulumi.output({
        projectId,
        developerGroupName,
        authentikDeveloperGroupId: developerGroup.id,
        vault: {
          policyName: devReadPolicy.name,
          identityGroupId: developerIdentityGroup.id,
          devSecretPath: pulumi.interpolate`${kvMount}/data/${secretPath}`,
        },
      }),
      secret: pulumi.secret({
        dev: {
          cliPath: `${kvMount}/${secretPath}`,
        },
      }),
    };
  },
);
