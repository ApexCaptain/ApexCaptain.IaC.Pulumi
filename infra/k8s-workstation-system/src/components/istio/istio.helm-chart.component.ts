import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface IstioHelmChartComponentArgsShape {
  helm: {
    istio: {
      version: string;
    };
  };
  meshId: string;
  workstationIpV4Address: string;
  ingressGatewayIp: string;
  topology: {
    clusterName: string;
    network: string;
  };
  additionalPorts: {
    name: string;
    port: number;
    protocol: string;
    description: string;
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

    const istioRepositoryUrl =
      'https://istio-release.storage.googleapis.com/charts';

    const istioBaseRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-istioBaseRelease`,
      {
        name: 'istio-base',
        chart: 'base',
        version: args.helm.istio.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: istioRepositoryUrl,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
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
          repo: istioRepositoryUrl,
        },
        waitForJobs: true,
        values: {
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
        dependsOn: [istioBaseRelease],
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
          repo: istioRepositoryUrl,
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
              .output(args.additionalPorts)
              .apply(resolvedAdditionalPorts => [
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
                ...resolvedAdditionalPorts.map(eachAdditionalPort => {
                  return {
                    name: utils.functions.kebabCase(eachAdditionalPort.name),
                    port: eachAdditionalPort.port,
                    protocol: eachAdditionalPort.protocol,
                    targetPort: eachAdditionalPort.port,
                  };
                }),
              ]),
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
