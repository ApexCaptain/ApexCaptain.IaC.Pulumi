/**
 * Goldilocks dashboard — Authentik Proxy + ext-authz
 *
 * qBittorrent와 동일 패턴. Outpost가 이미 떠 있으므로
 * OutpostProviderAttachment로 provider만 추가.
 */
import { authentik } from '@common/bridged-provider';
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface GoldilocksServiceMeshComponentArgsShape {
  namespace: string;
  ingress: {
    istioNamespace: string;
    goldilocksDashboard: {
      host: string;
      serviceName: string;
      gatewayPath: string;
      gatewayLabel: string;
      port: number;
    };
  };
  authentik: {
    allowedGroupId: string;
    proxyOutpostId: string;
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

export type GoldilocksServiceMeshComponentArgs =
  utils.types.DeepPulumiInput<GoldilocksServiceMeshComponentArgsShape>;

export const GoldilocksServiceMeshComponent = utils.functions.defineComponent(
  'goldilocks-service-mesh',
  (
    args: GoldilocksServiceMeshComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    new customResources.resources.k8s.crd.istio.VirtualServiceV1(
      `${resourceName}-goldilocksVirtualService`,
      {
        metadata: {
          name: 'goldilocks',
          namespace: args.namespace,
        },
        spec: {
          hosts: [args.ingress.goldilocksDashboard.host],
          gateways: [args.ingress.goldilocksDashboard.gatewayPath],
          http: [
            {
              route: [
                {
                  destination: {
                    host: args.ingress.goldilocksDashboard.serviceName,
                    port: {
                      number: args.ingress.goldilocksDashboard.port,
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

    const goldilocksAuthentikProxyProvider = new authentik.ProviderProxy(
      `${resourceName}-goldilocksAuthentikProxyProvider`,
      {
        name: 'goldilocks-authentik-proxy-provider',
        mode: 'forward_single',
        internalHost: pulumi.interpolate`http://${args.ingress.goldilocksDashboard.serviceName}.${args.namespace}.svc.cluster.local`,
        externalHost: pulumi.interpolate`https://${args.ingress.goldilocksDashboard.host}`,
        authorizationFlow: args.authentik.flow.authorizationFlowId,
        invalidationFlow: args.authentik.flow.invalidationFlowId,
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    new authentik.OutpostProviderAttachment(
      `${resourceName}-goldilocksAuthentikOutpostProviderAttachment`,
      {
        outpost: args.authentik.proxyOutpostId,
        protocolProvider: goldilocksAuthentikProxyProvider.id.apply(id =>
          parseInt(id),
        ),
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    const goldilocksAuthentikApplication = new authentik.Application(
      `${resourceName}-goldilocksAuthentikApplication`,
      {
        name: 'goldilocks',
        slug: 'goldilocks',
        protocolProvider: goldilocksAuthentikProxyProvider.id.apply(id =>
          parseInt(id),
        ),
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    new authentik.PolicyBinding(
      `${resourceName}-goldilocksAuthentikApplicationGroupBinding`,
      {
        target: goldilocksAuthentikApplication.uuid,
        group: args.authentik.allowedGroupId,
        order: 0,
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    new customResources.resources.k8s.crd.istio.AuthorizationPolicyV1(
      `${resourceName}-goldilocksAuthorizationPolicy`,
      {
        metadata: {
          name: 'goldilocks',
          namespace: args.ingress.istioNamespace,
        },
        spec: {
          selector: {
            matchLabels: {
              istio: args.ingress.goldilocksDashboard.gatewayLabel,
            },
          },
          action: 'CUSTOM',
          provider: {
            name: args.authentik.proxyOutpostProviderName,
          },
          rules: pulumi
            .all([
              args.ingress.goldilocksDashboard.host,
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
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
