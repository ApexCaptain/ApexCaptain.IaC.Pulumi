/**
 * Authentik Web UI — ingress 라우팅
 *
 * auth.* 호스트는 proxy outpost 없이 바로 VirtualService로 연결.
 * CORS는 같은 zone의 다른 앱(Jellyfin SSO callback 등)에서 Authentik API를 부를 수 있게 열어둔다.
 */
import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface AuthentikServiceMeshComponentArgsShape {
  namespace: string;
  rootDomain: string;
  ingress: {
    authentikWebUi: {
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

export type AuthentikServiceMeshComponentArgs =
  utils.types.DeepPulumiInput<AuthentikServiceMeshComponentArgsShape>;

export const AuthentikServiceMeshComponent = utils.functions.defineComponent(
  'authentikServiceMesh',
  (
    args: AuthentikServiceMeshComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
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
              mode: 'PERMISSIVE',
            },
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    const authentikVirtualService =
      new customResources.resources.k8s.crd.istio.VirtualServiceV1(
        `${resourceName}-authentikVirtualService`,
        {
          metadata: {
            name: 'authentik',
            namespace: args.namespace,
          },
          spec: {
            hosts: [args.ingress.authentikWebUi.host],
            gateways: [args.ingress.authentikWebUi.gatewayPath],
            http: [
              {
                route: [
                  {
                    destination: {
                      host: args.ingress.authentikWebUi.serviceName,
                      port: {
                        number: args.ingress.authentikWebUi.port,
                      },
                    },
                  },
                ],
                corsPolicy: {
                  allowOrigins: [
                    {
                      regex: pulumi.interpolate`https://.*\\.${args.rootDomain}`,
                    },
                  ],
                  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                  allowHeaders: [
                    'Content-Type',
                    'Authorization',
                    'X-Requested-With',
                    'X-authentik-auth-callback',
                  ],
                  exposeHeaders: ['Content-Type', 'Authorization'],
                  allowCredentials: true,
                  maxAge: '24h',
                },
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
