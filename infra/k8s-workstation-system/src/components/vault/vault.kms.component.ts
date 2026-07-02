/**
 * Vault auto-unseal용 OCI KMS + 전용 IAM
 *
 * Vault Helm이 OCI KMS seal을 쓰려면 compartment·vault·key·API signing user가 필요하다.
 * KMS key 생성 직후 management endpoint 전파가 느려서 90초 Sleep을 둔다.
 * (OCI 특: "만들었는데 아직 없대요" 구간)
 */
import * as utils from '@common/utils/src';
import * as oci from '@pulumi/oci';
import * as pulumi from '@pulumi/pulumi';
import * as tls from '@pulumi/tls';
import * as time from '@pulumiverse/time';

interface VaultKmsComponentArgsShape {
  tenancyOcid: string;
  region: string;

  providers: {
    oci: oci.Provider;
  };
}

export type VaultKmsComponentArgs =
  utils.types.DeepPulumiInput<VaultKmsComponentArgsShape>;

export const VaultKmsComponent = utils.functions.defineComponent(
  'vaultKms',
  (
    args: VaultKmsComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    // KMS 전용 compartment — Vault unseal key만 격리
    const kmsCompartment = new oci.identity.Compartment(
      `${resourceName}-kmsCompartment`,
      {
        name: 'kms-compartment',
        description: 'KMS compartment',
        compartmentId: args.tenancyOcid,
      },
      {
        ...opts,
        provider: args.providers.oci,
      },
    );

    const ociKmsVault = new oci.kms.Vault(
      `${resourceName}-ociKmsVault`,
      {
        compartmentId: kmsCompartment.id,
        displayName: 'oci-kms-vault',
        vaultType: 'DEFAULT',
      },
      {
        ...opts,
        provider: args.providers.oci,
        dependsOn: [kmsCompartment],
      },
    );

    const ociKmsVaultManagementEndpointPropagationDelay = new time.Sleep(
      `${resourceName}-ociKmsVaultManagementEndpointPropagationDelay`,
      {
        createDuration: '90s',
      },
      {
        ...opts,
        dependsOn: [ociKmsVault],
      },
    );

    const ociKmsKey = new oci.kms.Key(
      `${resourceName}-ociKmsKey`,
      {
        compartmentId: kmsCompartment.id,
        displayName: 'oci-kms-key',
        keyShape: {
          algorithm: 'AES',
          length: 32,
        },
        managementEndpoint: ociKmsVault.managementEndpoint,
      },
      {
        ...opts,
        provider: args.providers.oci,
        dependsOn: [ociKmsVault, ociKmsVaultManagementEndpointPropagationDelay],
      },
    );

    // Vault Group, User, Policy
    const vaultGroupName = 'vault-group';
    const vaultUserName = 'vault-user';
    const vaultKmsUnsealPolicyName = 'vault-kms-unseal';

    const ociVaultGroup = new oci.identity.Group(
      `${resourceName}-ociVaultGroup`,
      {
        compartmentId: args.tenancyOcid,
        description: 'Vault KMS auto-unseal group',
        name: vaultGroupName,
      },
      {
        ...opts,
        provider: args.providers.oci,
      },
    );

    const ociVaultUser = new oci.identity.User(
      `${resourceName}-ociVaultUser`,
      {
        compartmentId: args.tenancyOcid,
        description: 'Vault KMS auto-unseal user',
        name: vaultUserName,
      },
      {
        ...opts,
        provider: args.providers.oci,
      },
    );

    const ociVaultUserCapabilities =
      new oci.identity.UserCapabilitiesManagement(
        `${resourceName}-ociVaultUserCapabilities`,
        {
          userId: ociVaultUser.id,
          canUseApiKeys: true,
          canUseConsolePassword: false,
          canUseAuthTokens: false,
          canUseCustomerSecretKeys: false,
          canUseSmtpCredentials: false,
        },
        {
          ...opts,
          provider: args.providers.oci,
          dependsOn: [ociVaultUser],
        },
      );

    const ociVaultUserGroupMembership = new oci.identity.UserGroupMembership(
      `${resourceName}-ociVaultUserGroupMembership`,
      {
        groupId: ociVaultGroup.id,
        userId: ociVaultUser.id,
      },
      {
        ...opts,
        provider: args.providers.oci,
        dependsOn: [ociVaultGroup, ociVaultUser],
      },
    );

    const ociVaultApiSigningKey = new tls.PrivateKey(
      `${resourceName}-ociVaultApiSigningKey`,
      {
        algorithm: 'RSA',
        rsaBits: 2048,
      },
      {
        ...opts,
      },
    );

    const ociVaultApiKey = new oci.identity.ApiKey(
      `${resourceName}-ociVaultApiKey`,
      {
        userId: ociVaultUser.id,
        keyValue: ociVaultApiSigningKey.publicKeyPem,
      },
      {
        ...opts,
        provider: args.providers.oci,
        dependsOn: [ociVaultUserCapabilities, ociVaultApiSigningKey],
      },
    );

    const vaultKmsUnsealPolicyStatement = pulumi
      .all([kmsCompartment.id, ociKmsKey.id])
      .apply(([compartmentId, keyId]) => {
        return utils.functions.createOciPolicyStatement({
          subject: { type: 'group', targets: [vaultGroupName] },
          verb: 'use',
          resourceType: 'keys',
          location: { type: 'compartment-id', expression: compartmentId },
          condition: `target.key.id = '${keyId}'`,
        });
      });

    const ociVaultKmsUnsealPolicy = new oci.identity.Policy(
      `${resourceName}-ociVaultKmsUnsealPolicy`,
      {
        compartmentId: args.tenancyOcid,
        name: vaultKmsUnsealPolicyName,
        description: 'Allow Vault to use the KMS unseal key',
        statements: [vaultKmsUnsealPolicyStatement],
      },
      {
        ...opts,
        provider: args.providers.oci,
        dependsOn: [ociVaultGroup, ociKmsKey, ociVaultUserGroupMembership],
      },
    );

    return {
      output: pulumi.output({
        compartmentId: kmsCompartment.id,
        groupName: vaultGroupName,
        userName: vaultUserName,
        userId: ociVaultUser.id,
        kmsVaultId: ociKmsVault.id,
        kmsUnsealPolicyId: ociVaultKmsUnsealPolicy.id,
      }),
      secret: pulumi.secret(
        pulumi
          .all([
            ociKmsKey.id,
            ociKmsVault.cryptoEndpoint,
            ociKmsVault.managementEndpoint,
            ociVaultUser.id,
            args.tenancyOcid,
            args.region,
            ociVaultApiKey.fingerprint,
            ociVaultApiSigningKey.privateKeyPem,
          ])
          .apply(
            ([
              keyId,
              cryptoEndpoint,
              managementEndpoint,
              userOcid,
              tenancyOcid,
              region,
              fingerprint,
              privateKey,
            ]) => ({
              kms: {
                keyId,
                cryptoEndpoint,
                managementEndpoint,
              },
              unsealAuth: {
                userOcid,
                tenancyOcid,
                fingerprint,
                privateKey,
                region,
              },
            }),
          ),
      ),
    };
  },
);
