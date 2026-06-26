import { authentik } from '@common/bridged-provider';
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface QbittorrentServiceMeshComponentArgsShape {
  namespace: string;
  ingress: {
    istioNamespace: string;
    qbittorrentWebUi: {
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

export type QbittorrentServiceMeshComponentArgs =
  utils.types.DeepPulumiInput<QbittorrentServiceMeshComponentArgsShape>;

export const QbittorrentServiceMeshComponent = utils.functions.defineComponent(
  'qbittorrent-service-mesh',
  (
    args: QbittorrentServiceMeshComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const qbittorrentVirtualService =
      new customResources.resources.k8s.crd.istio.VirtualServiceV1(
        `${resourceName}-qbittorrentVirtualService`,
        {
          metadata: {
            name: 'qbittorrent',
            namespace: args.namespace,
          },
          spec: {
            hosts: [args.ingress.qbittorrentWebUi.host],
            gateways: [args.ingress.qbittorrentWebUi.gatewayPath],
            http: [
              {
                route: [
                  {
                    destination: {
                      host: args.ingress.qbittorrentWebUi.serviceName,
                      port: {
                        number: args.ingress.qbittorrentWebUi.port,
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

    const qbittorrentAuthentikProxyProvider = new authentik.ProviderProxy(
      `${resourceName}-qbittorrentAuthentikProxyProvider`,
      {
        name: 'qbittorrent-authentik-proxy-provider',
        mode: 'forward_single',
        internalHost: pulumi.interpolate`http://${args.ingress.qbittorrentWebUi.serviceName}.${args.namespace}.svc.cluster.local`,
        externalHost: pulumi.interpolate`https://${args.ingress.qbittorrentWebUi.host}`,
        authorizationFlow: args.authentik.flow.authorizationFlowId,
        invalidationFlow: args.authentik.flow.invalidationFlowId,
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    const outpostProviderAttachment = new authentik.OutpostProviderAttachment(
      `${resourceName}-qbittorrentAuthentikOutpostProviderAttachment`,
      {
        outpost: args.authentik.proxyOutpostId,
        protocolProvider: qbittorrentAuthentikProxyProvider.id.apply(id =>
          parseInt(id),
        ),
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    const qbittorrentAuthentikApplication = new authentik.Application(
      `${resourceName}-qbittorrentAuthentikApplication`,
      {
        name: 'qbittorrent',
        slug: 'qbittorrent',
        protocolProvider: qbittorrentAuthentikProxyProvider.id.apply(id =>
          parseInt(id),
        ),
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    new authentik.PolicyBinding(
      `${resourceName}-qbittorrentAuthentikApplicationGroupBinding`,
      {
        target: qbittorrentAuthentikApplication.uuid,
        group: args.authentik.allowedGroupId,
        order: 0,
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    const qbittorrentAuthorizationPolicy =
      new customResources.resources.k8s.crd.istio.AuthorizationPolicyV1(
        `${resourceName}-qbittorrentAuthorizationPolicy`,
        {
          metadata: {
            name: 'qbittorrent',
            namespace: args.ingress.istioNamespace,
          },
          spec: {
            selector: {
              matchLabels: {
                istio: args.ingress.qbittorrentWebUi.gatewayLabel,
              },
            },
            action: 'CUSTOM',
            provider: {
              name: args.authentik.proxyOutpostProviderName,
            },
            rules: pulumi
              .all([
                args.ingress.qbittorrentWebUi.host,
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
