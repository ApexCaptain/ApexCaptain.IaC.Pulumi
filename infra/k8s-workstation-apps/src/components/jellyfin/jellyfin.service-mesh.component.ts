/**
 * Jellyfin ingress — sidecar mesh.
 *
 * Ambient HBONE 회피(istio/istio#60074): namespace는 `dataplane-mode: none` + sidecar.
 * AuthorizationPolicy: istio-ingressgateway SA에서만 ALLOW (STRICT mTLS).
 * Direct gateway SFTP도 같은 ingressgateway Pod/SA.
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
