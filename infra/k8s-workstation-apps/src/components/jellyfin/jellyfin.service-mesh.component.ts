/**
 * Jellyfin ingress — ambient mesh
 *
 * SSO는 jellyfin-plugin-sso + Authentik OIDC(별도 컴포넌트)라 "proxy outpost 없음".
 * AuthorizationPolicy는 ingress gateway SA에서만 들어오게 막는다 (STRICT mTLS).
 */
import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface JellyfinServiceMeshComponentArgsShape {
  namespace: string;
  authorizationPolicy: {
    from: {
      istioIngress: {
        namespace: string;
        serviceAccountName: string;
      };
    };
  };
  ingress: {
    jellyfinWebUi: {
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

export type JellyfinServiceMeshComponentArgs =
  utils.types.DeepPulumiInput<JellyfinServiceMeshComponentArgsShape>;

export const JellyfinServiceMeshComponent = utils.functions.defineComponent(
  'jellyfinServiceMesh',
  (
    args: JellyfinServiceMeshComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const jellyfinVirtualService =
      new customResources.resources.k8s.crd.istio.VirtualServiceV1(
        `${resourceName}-jellyfinVirtualService`,
        {
          metadata: {
            name: 'jellyfin',
            namespace: args.namespace,
          },
          spec: {
            hosts: [args.ingress.jellyfinWebUi.host],
            gateways: [args.ingress.jellyfinWebUi.gatewayPath],
            http: [
              {
                route: [
                  {
                    destination: {
                      host: args.ingress.jellyfinWebUi.serviceName,
                      port: {
                        number: args.ingress.jellyfinWebUi.port,
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

    const defaultPeerAuthentication =
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

    const jellyfinAuthorizationPolicy =
      new customResources.resources.k8s.crd.istio.AuthorizationPolicyV1(
        `${resourceName}-jellyfinAuthorizationPolicy`,
        {
          metadata: {
            name: 'jellyfin',
            namespace: args.namespace,
          },
          spec: {
            action: 'ALLOW',
            rules: [
              {
                from: [
                  {
                    // Istio Ingress Gateway에서 들어오는 요청만 허용
                    source: {
                      principals: [
                        pulumi.interpolate`cluster.local/ns/${args.authorizationPolicy.from.istioIngress.namespace}/sa/${args.authorizationPolicy.from.istioIngress.serviceAccountName}`,
                      ],
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

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
