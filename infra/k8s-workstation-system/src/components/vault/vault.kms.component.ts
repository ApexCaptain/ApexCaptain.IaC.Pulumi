import * as utils from '@common/utils/src';
import * as oci from '@pulumi/oci';
import * as pulumi from '@pulumi/pulumi';

interface VaultKmsComponentArgsShape {
  tenancyOcid: string;

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
      'ociKmsVault',
      {
        compartmentId: kmsCompartment.id,
        displayName: 'oci-kms-vault',
        vaultType: 'DEFAULT',
      },
      {
        ...opts,
        provider: args.providers.oci,
      },
    );

    const ociKmsKey = new oci.kms.Key(
      'ociKmsKey',
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
        dependsOn: [ociKmsVault],
      },
    );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({
        keyId: ociKmsKey.id,
        cryptoEndpoint: ociKmsVault.cryptoEndpoint,
        managementEndpoint: ociKmsVault.managementEndpoint,
      }),
    };
  },
);
