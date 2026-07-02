/**
 * 개발자용 Vault KV read RBAC (Authentik OIDC identity group)
 *
 * Authentik 그룹 `developer-{name}` 멤버가 OIDC login 시
 * `{kvMount}/{secretDirPath}/*` 하위 secret을 read/list 할 수 있게 한다.
 *
 * KV secret 데이터(SecretV2)는 이 컴포넌트 밖에서 caller가 `secretDirPath` 아래에 생성한다.
 * dev 등 필요한 스택에서만 instantiate 할 것.
 *
 * ```
 * [Alice ∈ developer-{name}] vault login -method=oidc
 *        → token + read-policy-{name}
 *        → vault kv get {kvMount}/{secretDirPath}/app
 *
 * vaultAuthentik (OIDC mount accessor)
 *        ↓
 * DeveloperIdentityV1 — Authentik group · Vault policy · identity group · alias
 *        ↓
 * caller — vault.kv.SecretV2 under secretDirPath/
 * ```
 */
import { authentik } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
import dedent from 'dedent';

interface DeveloperIdentityV1ComponentArgsShape {
  /** Vault policy·Authentik group 식별자 (`read-policy-{name}`, `developer-{name}`) */
  name: string;
  /**
   * KV v2 logical directory (mount 제외).
   * 예: `workstation-apps/my-app/dev` — SecretV2 `name`은 이 prefix 아래에 둔다.
   */
  secretDirPath: string;
  /** Vault OIDC auth mount accessor (`vaultAuthentik` output) */
  oidcMountAccessor: string;
  /** KV v2 mount path (예: `secret`) */
  kvMount: string;
  providers: {
    authentik: authentik.Provider;
    vault: vault.Provider;
  };
}

export type DeveloperIdentityV1ComponentArgs =
  utils.types.DeepPulumiInput<DeveloperIdentityV1ComponentArgsShape>;

export const DeveloperIdentityV1Component = utils.functions.defineComponent(
  'secrets:developerIdentity:v1',
  (
    args: DeveloperIdentityV1ComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    // Authentik group name = OIDC groups claim = Vault GroupAlias name (세 값이 동일해야 함)
    const developerGroupName = pulumi.interpolate`developer-${args.name}`;

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
        name: pulumi.interpolate`read-policy-${args.name}`,
        policy: pulumi.all([args.kvMount, args.secretDirPath]).apply(
          ([resolvedKvMount, resolvedSecretDirPath]) => dedent`
            path "${resolvedKvMount}/data/${resolvedSecretDirPath}" {
              capabilities = ["read", "list"]
            }
            path "${resolvedKvMount}/data/${resolvedSecretDirPath}/*" {
              capabilities = ["read", "list"]
            }
            path "${resolvedKvMount}/metadata/${resolvedSecretDirPath}" {
              capabilities = ["read", "list"]
            }
            path "${resolvedKvMount}/metadata/${resolvedSecretDirPath}/*" {
              capabilities = ["read", "list"]
            }
        `,
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
          projectPath: args.secretDirPath,
          stage: pulumi.getStack() as utils.enums.StackStage,
        },
      },
      {
        ...opts,
        provider: args.providers.vault,
        dependsOn: [vaultDeveloperPolicy],
      },
    );

    // alias name 이 OIDC token groups claim 과 일치해야 policy 가 붙는다
    const vaultGroupAlias = new vault.identity.GroupAlias(
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

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
