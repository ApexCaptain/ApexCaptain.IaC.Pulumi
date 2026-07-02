/**
 * Vault 공개 Ingress — TLS origination
 *
 * Gateway에서 LE로 TLS를 끊은 뒤, Vault Pod까지는 다시 HTTPS로 올린다.
 * Vault는 HTTPS only라서 평문 HTTP로 내면
 * `Client sent an HTTP request to an HTTPS server`가 난다.
 *
 * ```
 * [클라이언트] --HTTPS--> Ingress GW (LE 종료)
 *            --HTTP-->  VirtualService
 *            --HTTPS--> DestinationRule origination → vault:8200
 * ```
 *
 * Vault namespace는 mesh 밖. OIDC는 vault.authentik 컴포넌트.
 */
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';

interface VaultServiceMeshComponentArgsShape {
  namespace: string;
  ingress: {
    istioNamespace: string;
    vault: {
      host: string;
      serviceHost: string;
      tlsServerName: string;
      gatewayPath: string;
      gatewayLabel: string;
      port: number;
    };
  };
  vault: {
    bootstrapToken: string;
    rootCaSecretName: string;
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type VaultServiceMeshComponentArgs =
  utils.types.DeepPulumiInput<VaultServiceMeshComponentArgsShape>;

export const VaultServiceMeshComponent = utils.functions.defineComponent(
  'vault-service-mesh',
  (
    args: VaultServiceMeshComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    // Vault 내부 CA → istio-system으로 복사 (gateway SDS가 credentialName으로 참조)
    const vaultCaSecret = kubernetes.core.v1.Secret.get(
      `${resourceName}-vaultCaSecret`,
      pulumi.interpolate`${args.namespace}/${args.vault.rootCaSecretName}`,
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const vaultTlsOriginationCaSecretName = 'vault-tls-origination-ca';

    const vaultTlsOriginationCaSecret = new kubernetes.core.v1.Secret(
      `${resourceName}-vaultTlsOriginationCaSecret`,
      {
        metadata: {
          name: vaultTlsOriginationCaSecretName,
          namespace: args.ingress.istioNamespace,
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

    // Gateway → Vault 구간 HTTPS 재협상
    const vaultTlsOriginationDestinationRule =
      new customResources.resources.k8s.crd.istio.DestinationRuleV1(
        `${resourceName}-vaultTlsOriginationDestinationRule`,
        {
          metadata: {
            name: 'vault-tls-origination',
            namespace: args.ingress.istioNamespace,
          },
          spec: {
            host: args.ingress.vault.serviceHost,
            trafficPolicy: {
              portLevelSettings: [
                {
                  port: {
                    number: args.ingress.vault.port,
                  },
                  tls: {
                    mode: 'SIMPLE',
                    sni: args.ingress.vault.tlsServerName,
                    credentialName: vaultTlsOriginationCaSecretName,
                  },
                },
              ],
            },
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
          dependsOn: [vaultTlsOriginationCaSecret],
        },
      );

    const vaultVirtualService =
      new customResources.resources.k8s.crd.istio.VirtualServiceV1(
        `${resourceName}-vaultVirtualService`,
        {
          metadata: {
            name: 'vault',
            namespace: args.namespace,
          },
          spec: {
            hosts: [args.ingress.vault.host],
            gateways: [args.ingress.vault.gatewayPath],
            http: [
              {
                route: [
                  {
                    destination: {
                      host: args.ingress.vault.serviceHost,
                      port: {
                        number: args.ingress.vault.port,
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
          dependsOn: [vaultTlsOriginationDestinationRule],
        },
      );

    const vaultProviderConfig: vault.ProviderArgs = {
      address: pulumi.interpolate`https://${args.ingress.vault.host}`,
      token: args.vault.bootstrapToken,
    };

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({
        vaultProviderConfig,
      }),
    };
  },
);
