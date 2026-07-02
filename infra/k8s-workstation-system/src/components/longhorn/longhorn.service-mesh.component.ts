/**
 * Longhorn UI — Istio ingress + Authentik Proxy
 *
 * qBittorrent·Longhorn처럼 **Authentik Proxy(Outpost)** 패턴.
 * VirtualService로 ingress, AuthorizationPolicy로 ext-authz → outpost Pod.
 *
 * Longhorn이 Outpost bootstrap provider라 contract에서 가장 먼저 Outpost를 만든다.
 * 이후 앱(tools)은 OutpostProviderAttachment로 provider만 추가한다.
 */
import { authentik } from '@common/bridged-provider';
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface LonghornServiceMeshComponentArgsShape {
  namespace: string;
  ingress: {
    istioNamespace: string;
    longhornFrontend: {
      host: string;
      serviceName: string;
      gatewayPath: string;
      gatewayLabel: string;
      port: number;
    };
  };
  authentik: {
    allowedGroupId: string;
    proxyOutpostProviderName: string;
    flow: {
      authorizationFlowId: string;
      invalidationFlowId: string;
    };
    authorizationBypass?: {
      ipBlocksToBypass?: string[];
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
    authentik: authentik.Provider;
  };
}

export type LonghornServiceMeshComponentArgs =
  utils.types.DeepPulumiInput<LonghornServiceMeshComponentArgsShape>;

export const LonghornServiceMeshComponent = utils.functions.defineComponent(
  'longhorn-service-mesh',
  (
    args: LonghornServiceMeshComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const longhornFrontendVirtualService =
      new customResources.resources.k8s.crd.istio.VirtualServiceV1(
        `${resourceName}-longhornFrontendVirtualService`,
        {
          metadata: {
            name: 'longhorn-frontend',
            namespace: args.namespace,
          },
          spec: {
            hosts: [args.ingress.longhornFrontend.host],
            gateways: [args.ingress.longhornFrontend.gatewayPath],
            http: [
              {
                route: [
                  {
                    destination: {
                      host: args.ingress.longhornFrontend.serviceName,
                      port: {
                        number: args.ingress.longhornFrontend.port,
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

    // Authentik — Proxy provider + Application + 그룹 정책
    const longhornFrontendAuthentikProxyProvider = new authentik.ProviderProxy(
      `${resourceName}-longhornFrontendAuthentikProxyProvider`,
      {
        name: 'longhorn-frontend-authentik-proxy-provider',
        mode: 'forward_single',
        internalHost: pulumi.interpolate`http://${args.ingress.longhornFrontend.serviceName}.${args.namespace}.svc.cluster.local`,
        externalHost: pulumi.interpolate`https://${args.ingress.longhornFrontend.host}`,
        authorizationFlow: args.authentik.flow.authorizationFlowId,
        invalidationFlow: args.authentik.flow.invalidationFlowId,
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    const longhornFrontendAuthentikApplication = new authentik.Application(
      `${resourceName}-longhornFrontendAuthentikApplication`,
      {
        name: 'longhorn-frontend',
        slug: 'longhorn-frontend',
        protocolProvider: longhornFrontendAuthentikProxyProvider.id.apply(id =>
          parseInt(id),
        ),
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    new authentik.PolicyBinding(
      `${resourceName}-longhornFrontendAuthentikApplicationGroupBinding`,
      {
        target: longhornFrontendAuthentikApplication.uuid,
        group: args.authentik.allowedGroupId,
        order: 0,
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    // Gateway에서 longhorn 호스트로 들어오면 outpost에 인증 위임
    const longhornFrontendAuthorizationPolicy =
      new customResources.resources.k8s.crd.istio.AuthorizationPolicyV1(
        `${resourceName}-longhornFrontendAuthorizationPolicy`,
        {
          metadata: {
            name: 'longhorn-frontend',
            namespace: args.ingress.istioNamespace,
          },
          spec: {
            selector: {
              matchLabels: {
                istio: args.ingress.longhornFrontend.gatewayLabel,
              },
            },
            action: 'CUSTOM',
            provider: {
              name: args.authentik.proxyOutpostProviderName,
            },
            rules: pulumi
              .all([
                args.ingress.longhornFrontend.host,
                pulumi.output(args.authentik.authorizationBypass),
              ])
              .apply(([resolvedHost, resolvedAuthorizationBypass]) => {
                const ipBlocksToBypass =
                  resolvedAuthorizationBypass?.ipBlocksToBypass ?? [];

                return [
                  {
                    ...(ipBlocksToBypass.length > 0
                      ? {
                        from: [
                          {
                            source: {
                              notRemoteIpBlocks: ipBlocksToBypass,
                            },
                          },
                        ],
                      }
                      : {}),
                    to: [
                      {
                        operation: {
                          hosts: [resolvedHost],
                        },
                      },
                    ],
                  },
                ];
              }),
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    return {
      output: pulumi.output({
        authentikProxyProviderId: longhornFrontendAuthentikProxyProvider.id,
      }),
      secret: pulumi.secret({}),
    };
  },
);
