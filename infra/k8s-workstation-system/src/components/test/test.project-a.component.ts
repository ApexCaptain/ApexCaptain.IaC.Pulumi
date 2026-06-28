/**
 * Test — Project A 개발자용 Vault dev secret (예시)
 *
 * Authentik 그룹 `project-a-dev` 멤버만 OIDC login 시
 * `secret/workstation-apps/project-a/dev/*` read.
 *
 * Project B와 IaC·Authentik·Vault 리소스는 공유하지 않는다.
 *
 * ```
 * [Alice ∈ project-a-dev] vault login -method=oidc
 *        → token + project-a-dev-read
 *        → vault kv get secret/workstation-apps/project-a/dev/app
 *
 * [Bob ∉ project-a-dev] 동일 login → project-a path permission denied
 * ```
 */
import { authentik } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
import dedent from 'dedent';

const projectId = 'project-a';
const developerGroupName = 'project-a-dev';
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

interface TestProjectAComponentArgsShape {
  /** Vault OIDC auth mount accessor (`vaultAuthentik` output) */
  oidcMountAccessor: pulumi.Input<string>;
  providers: {
    vault: vault.Provider;
    authentik: authentik.Provider;
  };
}

export type TestProjectAComponentArgs = TestProjectAComponentArgsShape;

export const TestProjectAComponent = utils.functions.defineComponent(
  'testProjectA',
  (
    args: TestProjectAComponentArgs,
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
            'postgresql://project_a_app:dev-only@postgres.dev.local:5432/project_a',
          API_KEY: 'dev-sandbox-project-a-replace-via-rotation',
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
          /** devContainer 예: vault kv get -field=DATABASE_URL secret/workstation-apps/project-a/dev/app */
          cliPath: `${kvMount}/${secretPath}`,
        },
      }),
    };
  },
);
