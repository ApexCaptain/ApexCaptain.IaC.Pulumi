/**
 * Istio Ambient mesh (workstation)
 *
 * profile: ambient — sidecar 대신 ztunnel + waypoint(필요 시) 구조.
 * istiod meshConfig에 Authentik proxy outpost를 ext-authz provider로 등록해 두고,
 * AuthorizationPolicy에서 `provider.name`으로 꺼내 쓴다.
 *
 * ingress gateway Service는 Cilium LB IP + workstation 외부 IP를 같이 박는다.
 * direct gateway 포트(SFTP 등)는 별도 Gateway CR로 TCP passthrough.
 */
import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface IstioHelmChartComponentArgsShape {
  helm: {
    istio: {
      version: string;
      repositoryUrl: string;
    };
  };
  meshId: string;
  workstationIpV4Address: string;
  ingressGatewayIp: string;
  topology: {
    clusterName: string;
    network: string;
  };
  directGatewayPorts: {
    name: string;
    port: number;
    protocol: string;
  }[];
  authentik: {
    namespace: string;
    proxyOutpostName: string;
    proxyOutpostProviderName: string;
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type IstioHelmChartComponentArgs =
  utils.types.DeepPulumiInput<IstioHelmChartComponentArgsShape>;

export const IstioHelmChartComponent = utils.functions.defineComponent(
  'istioHelmChart',
  (
    args: IstioHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      'namespace',
      {
        metadata: {
          name: 'istio-system',
          labels: {
            'topology.istio.io/network': args.topology.network,
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // base → cni → istiod → ztunnel → ingress gateway
    const istioBaseRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-istioBaseRelease`,
      {
        name: 'istio-base',
        chart: 'base',
        version: args.helm.istio.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.istio.repositoryUrl,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [namespace],
      },
    );

    const istioCniRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-istioCniRelease`,
      {
        name: 'istio-cni',
        chart: 'cni',
        version: args.helm.istio.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.istio.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          profile: 'ambient',
          global: {
            meshID: args.meshId,
            multiCluster: { clusterName: args.topology.clusterName },
            network: args.topology.network,
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [istioBaseRelease],
      },
    );

    const istiodRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-istiodRelease`,
      {
        name: 'istiod',
        chart: 'istiod',
        version: args.helm.istio.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.istio.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          profile: 'ambient',
          pilot: {
            cni: { enabled: true },
          },
          global: {
            meshID: args.meshId,
            multiCluster: {
              clusterName: args.topology.clusterName,
            },
            network: args.topology.network,
          },
          meshConfig: {
            defaultConfig: {
              gatewayTopology: {
                numTrustedProxies: 1,
              },
              proxyMetadata: {
                ISTIO_META_DNS_CAPTURE: true.toString(),
              },
            },
            trustDomain: 'cluster.local',
            accessLogFile: '/dev/stdout',
            // Longhorn·qBittorrent 등 proxy outpost 앱이 여기 이름을 참조
            extensionProviders: [
              {
                name: args.authentik.proxyOutpostProviderName,
                envoyExtAuthzHttp: {
                  service: pulumi.interpolate`ak-outpost-${args.authentik.proxyOutpostName}.${args.authentik.namespace}.svc.cluster.local`,
                  port: '9000',
                  pathPrefix: '/outpost.goauthentik.io/auth/envoy',
                  headersToDownstreamOnAllow: ['set-cookie'],
                  headersToUpstreamOnAllow: ['x-authentik-*', 'cookie'],
                  includeRequestHeadersInCheck: ['cookie'],
                },
              },
            ],
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [istioCniRelease],
      },
    );

    const ztunnelRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-ztunnelRelease`,
      {
        name: 'ztunnel',
        chart: 'ztunnel',
        version: args.helm.istio.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.istio.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          profile: 'ambient',
          global: {
            meshID: args.meshId,
            multiCluster: { clusterName: args.topology.clusterName },
            network: args.topology.network,
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [istiodRelease, istioCniRelease],
      },
    );

    const istioIngressGatewayLabel = 'ingressgateway';
    const istioIngressGatewayServiceAccountName = 'istio-ingressgateway';
    const istioIngressGatewayRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-istioIngressGatewayRelease`,
      {
        name: `istio-${istioIngressGatewayLabel}`,
        chart: 'gateway',
        version: args.helm.istio.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.istio.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          serviceAccount: {
            create: true,
            name: istioIngressGatewayServiceAccountName,
          },
          service: {
            type: 'LoadBalancer',
            ports: pulumi
              .output(args.directGatewayPorts)
              .apply(resolvedDirectGatewayPorts => {
                return [
                  {
                    name: 'status-port',
                    port: 15021,
                    protocol: 'TCP',
                    targetPort: 15021,
                  },
                  {
                    name: 'http2',
                    port: 80,
                    protocol: 'TCP',
                    targetPort: 80,
                  },
                  {
                    name: 'https',
                    port: 443,
                    protocol: 'TCP',
                    targetPort: 443,
                  },
                  ...resolvedDirectGatewayPorts.map(eachDirectGatewayPort => {
                    return {
                      name: utils.functions.kebabCase(
                        eachDirectGatewayPort.name,
                      ),
                      port: eachDirectGatewayPort.port,
                      protocol: eachDirectGatewayPort.protocol,
                      targetPort: eachDirectGatewayPort.port,
                    };
                  }),
                ];
              }),
            loadBalancerIP: args.ingressGatewayIp,
            externalIPs: [args.workstationIpV4Address],
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [istiodRelease],
      },
    );

    const defaultPeerAuthentication =
      new customResources.resources.k8s.crd.istio.PeerAuthenticationV1(
        `${resourceName}-defaultPeerAuthentication`,
        {
          metadata: {
            name: 'default',
            namespace: namespace.metadata.name,
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
          dependsOn: [istiodRelease, namespace],
        },
      );

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
        istioIngressGatewayLabel,
        istioIngressGatewayServiceAccountName,
      }),
      secret: pulumi.secret({}),
    };
  },
);
