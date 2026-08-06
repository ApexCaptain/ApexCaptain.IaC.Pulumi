import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface CoderServiceMeshComponentArgsShape {
  namespace: string;
  authorizationPolicy: {
    from: {
      istioIngress: {
        namespace: string;
        serviceAccountName: string;
      };
      allowedNamespaces: string[];
    };
  };
  adminApiToken: {
    token: string;
    organizationId: string;
  };
  ingress: {
    coderWebUi: {
      host: string;
      serviceName: string;
      gatewayPath: string;
      port: number;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type CoderServiceMeshComponentArgs =
  utils.types.DeepPulumiInput<CoderServiceMeshComponentArgsShape>;

export const CoderServiceMeshComponent = utils.functions.defineComponent(
  'coder-service-mesh',
  (
    args: CoderServiceMeshComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    new customResources.resources.k8s.crd.istio.VirtualServiceV1(
      `${resourceName}-coderVirtualService`,
      {
        metadata: {
          name: 'coder',
          namespace: args.namespace,
        },
        spec: {
          hosts: [args.ingress.coderWebUi.host],
          gateways: [args.ingress.coderWebUi.gatewayPath],
          http: [
            {
              route: [
                {
                  destination: {
                    host: args.ingress.coderWebUi.serviceName,
                    port: {
                      number: args.ingress.coderWebUi.port,
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
      },
    );

    new customResources.resources.k8s.crd.istio.PeerAuthenticationV1(
      `${resourceName}-defaultPeerAuthentication`,
      {
        metadata: {
          name: 'default',
          namespace: args.namespace,
        },
        spec: {
          mtls: {
            mode: 'STRICT',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    new customResources.resources.k8s.crd.istio.AuthorizationPolicyV1(
      `${resourceName}-coderAuthorizationPolicy`,
      {
        metadata: {
          name: 'coder',
          namespace: args.namespace,
        },
        spec: {
          action: 'ALLOW',
          rules: pulumi
            .all([
              args.authorizationPolicy.from.istioIngress.namespace,
              args.authorizationPolicy.from.istioIngress.serviceAccountName,
              args.authorizationPolicy.from.allowedNamespaces,
              args.namespace,
            ])
            .apply(
              ([
                ingressNamespace,
                ingressServiceAccountName,
                allowedNamespaces,
                coderNamespace,
              ]) => {
                const namespaceAllowList = Array.from(
                  new Set([coderNamespace, ...allowedNamespaces]),
                );

                return [
                  {
                    from: [
                      {
                        source: {
                          principals: [
                            `cluster.local/ns/${ingressNamespace}/sa/${ingressServiceAccountName}`,
                          ],
                        },
                      },
                      {
                        source: {
                          namespaces: namespaceAllowList,
                        },
                      },
                    ],
                  },
                ];
              },
            ),
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({
        coderdProviderConfig: {
          url: pulumi.interpolate`https://${args.ingress.coderWebUi.host}`,
          token: args.adminApiToken.token,
          // coderd TF provider는 auto-discover 실패 시 빈 문자열을 UUID로 검증하다 깨짐
          defaultOrganizationId: args.adminApiToken.organizationId,
        },
      }),
    };
  },
);
