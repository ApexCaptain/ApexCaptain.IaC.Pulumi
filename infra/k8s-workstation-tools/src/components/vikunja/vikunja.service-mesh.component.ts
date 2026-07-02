/**
 * Vikunja ingress — ambient mesh (Jellyfin과 동일 패턴).
 *
 * SSO는 Vikunja 네이티브 OIDC(별도 authentik 컴포넌트) — qBittorrent proxy outpost 없음.
 * AuthorizationPolicy: istio-ingressgateway SA에서만 ALLOW (STRICT mTLS).
 */
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface VikunjaServiceMeshComponentArgsShape {
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
    vikunjaWebUi: {
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

export type VikunjaServiceMeshComponentArgs =
  utils.types.DeepPulumiInput<VikunjaServiceMeshComponentArgsShape>;

export const VikunjaServiceMeshComponent = utils.functions.defineComponent(
  'vikunja-service-mesh',
  (
    args: VikunjaServiceMeshComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    // VirtualService: 외부 host → vikunja Service
    const vikunjaVirtualService =
      new customResources.resources.k8s.crd.istio.VirtualServiceV1(
        `${resourceName}-vikunjaVirtualService`,
        {
          metadata: {
            name: 'vikunja',
            namespace: args.namespace,
          },
          spec: {
            hosts: [args.ingress.vikunjaWebUi.host],
            gateways: [args.ingress.vikunjaWebUi.gatewayPath],
            http: [
              {
                route: [
                  {
                    destination: {
                      host: args.ingress.vikunjaWebUi.serviceName,
                      port: {
                        number: args.ingress.vikunjaWebUi.port,
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

    // namespace 기본 mTLS STRICT
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

    const vikunjaAuthorizationPolicy =
      new customResources.resources.k8s.crd.istio.AuthorizationPolicyV1(
        `${resourceName}-vikunjaAuthorizationPolicy`,
        {
          metadata: {
            name: 'vikunja',
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
