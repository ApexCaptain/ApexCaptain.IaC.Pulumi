import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface IstioGatewayComponentArgsShape {
  namespace: string;
  apexCaptainCloudflareZoneName: string;
  letsEncryptProdClusterIssuerName: string;
  letsEncryptStagingClusterIssuerName: string;
  istioIngressGatewayLabel: string;
  additionalPorts: {
    name: string;
    port: number;
    protocol: string;
    description: string;
  }[];
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type IstioGatewayComponentArgs =
  utils.types.DeepPulumiInput<IstioGatewayComponentArgsShape>;

export const IstioGatewayComponent = utils.functions.defineComponent(
  'istioGateway',
  (
    args: IstioGatewayComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    // Certificate
    const istioIngressGatewayWildcardProdCertSecretName =
      'istio-ingressgateway-wildcard-prod-cert';
    const istioIngressGatewayWildcardProdCertificate =
      new customResources.resources.k8s.crd.certManager.CertificateV1(
        `${resourceName}-istioIngressGatewayProductionCertificate`,
        {
          metadata: {
            name: 'istio-ingressgateway-production',
            namespace: args.namespace,
          },
          spec: {
            secretName: istioIngressGatewayWildcardProdCertSecretName,
            issuerRef: {
              name: args.letsEncryptProdClusterIssuerName,
              kind: 'ClusterIssuer',
            },
            dnsNames: [
              pulumi.interpolate`*.${args.apexCaptainCloudflareZoneName}`,
              args.apexCaptainCloudflareZoneName,
            ],
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    const istioIngressGatewayWildcardStagingCertSecretName =
      'istio-ingressgateway-wildcard-staging-cert';
    const istioIngressGatewayWildcardStagingCert =
      new customResources.resources.k8s.crd.certManager.CertificateV1(
        `${resourceName}-istioIngressGatewayStagingCertificate`,
        {
          metadata: {
            name: 'istio-ingressgateway-staging',
            namespace: args.namespace,
          },
          spec: {
            secretName: istioIngressGatewayWildcardStagingCertSecretName,
            issuerRef: {
              name: args.letsEncryptStagingClusterIssuerName,
              kind: 'ClusterIssuer',
            },
            dnsNames: [
              pulumi.interpolate`*.${args.apexCaptainCloudflareZoneName}`,
              args.apexCaptainCloudflareZoneName,
            ],
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    const istioIngressGatewayHosts = [
      pulumi.interpolate`*.${args.apexCaptainCloudflareZoneName}`,
    ];
    const istioIngressGateway =
      new customResources.resources.k8s.crd.istio.GatewayV1(
        `${resourceName}-istioIngressGateway`,
        {
          metadata: {
            name: 'istio-ingressgateway',
            namespace: args.namespace,
          },
          spec: {
            selector: {
              istio: args.istioIngressGatewayLabel,
            },
            servers: [
              {
                port: {
                  number: 80,
                  name: 'http',
                  protocol: 'HTTP',
                },
                hosts: istioIngressGatewayHosts,
                tls: {
                  httpsRedirect: true,
                },
              },
              {
                port: {
                  number: 443,
                  name: 'https',
                  protocol: 'HTTPS',
                },
                hosts: istioIngressGatewayHosts,
                tls: {
                  mode: 'SIMPLE',
                  credentialName: istioIngressGatewayWildcardProdCertSecretName,
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
    const istioIngressGatewayPath = pulumi.interpolate`${args.namespace}/${istioIngressGateway.metadata.name}`;

    // Direct Gateway
    const istioDirectGateway =
      new customResources.resources.k8s.crd.istio.GatewayV1(
        `${resourceName}-istioDirectGateway`,
        {
          metadata: {
            name: 'istio-directgateway',
            namespace: args.namespace,
          },
          spec: {
            selector: {
              istio: args.istioIngressGatewayLabel,
            },
            servers: pulumi
              .output(args.additionalPorts)
              .apply(resolvedAdditionalPorts => {
                return resolvedAdditionalPorts.map(eachAdditionalPort => {
                  return {
                    port: {
                      number: eachAdditionalPort.port,
                      name: utils.functions.kebabCase(eachAdditionalPort.name),
                      protocol: eachAdditionalPort.protocol,
                    },
                    hosts: ['*'],
                  };
                });
              }),
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );
    const istioDirectGatewayPath = pulumi.interpolate`${args.namespace}/${istioDirectGateway.metadata.name}`;

    return {
      output: pulumi.output({
        istioIngressGatewayPath,
        istioDirectGatewayPath,
      }),
      secret: pulumi.secret({}),
    };
  },
);
