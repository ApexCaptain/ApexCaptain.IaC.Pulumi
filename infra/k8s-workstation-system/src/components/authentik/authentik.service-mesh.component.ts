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
              // 추후 Strict로 변경 가능한지 확인
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
