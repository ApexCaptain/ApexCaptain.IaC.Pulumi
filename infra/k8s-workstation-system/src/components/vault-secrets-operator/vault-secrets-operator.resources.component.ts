/**
 * VSO 공유 리소스 — Vault CA Secret 복사 + VaultConnection
 *
 * VaultAuth / VaultStaticSecret은 앱 namespace(apps stack)에서 선언.
 * caCertSecretRef는 VaultConnection과 같은 namespace에 있어야 해서
 * vault ns CA를 VSO ns로 복사한다 (vault.service-mesh → istio-system 패턴과 동일).
 */
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface VaultSecretsOperatorResourcesComponentArgsShape {
  namespace: string;
  vault: {
    namespace: string;
    rootCaSecretName: string;
    address: string;
    tlsServerName: string;
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type VaultSecretsOperatorResourcesComponentArgs =
  utils.types.DeepPulumiInput<VaultSecretsOperatorResourcesComponentArgsShape>;

export const VaultSecretsOperatorResourcesComponent =
  utils.functions.defineComponent(
    'vaultSecretsOperatorResources',
    (
      args: VaultSecretsOperatorResourcesComponentArgs,
      opts: pulumi.ComponentResourceOptions,
      resourceName: string,
    ) => {
      const vaultConnectionName = 'vault';
      const vsoVaultCaSecretName = 'vault-ca-secret';

      const vaultCaSecret = kubernetes.core.v1.Secret.get(
        `${resourceName}-vaultCaSecret`,
        pulumi.interpolate`${args.vault.namespace}/${args.vault.rootCaSecretName}`,
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

      const vsoVaultCaSecret = new kubernetes.core.v1.Secret(
        `${resourceName}-vsoVaultCaSecret`,
        {
          metadata: {
            name: vsoVaultCaSecretName,
            namespace: args.namespace,
          },
          data: {
            'ca.crt': vaultCaSecret.data.apply(data => data['ca.crt'] ?? ''),
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
          dependsOn: [vaultCaSecret],
        },
      );

      const vaultConnection =
        new customResources.resources.k8s.crd.vso.VaultConnectionV1(
          `${resourceName}-vaultConnection`,
          {
            metadata: {
              name: vaultConnectionName,
              namespace: args.namespace,
            },
            spec: {
              address: args.vault.address,
              skipTLSVerify: false,
              caCertSecretRef: vsoVaultCaSecret.metadata.name,
              tlsServerName: args.vault.tlsServerName,
            },
          },
          {
            ...opts,
            provider: args.providers.kubernetes,
            dependsOn: [vsoVaultCaSecret],
          },
        );

      return {
        output: pulumi.output({
          vaultConnectionRef: pulumi.interpolate`${args.namespace}/${vaultConnection.metadata.name}`,
        }),
        secret: pulumi.secret({}),
      };
    },
  );
