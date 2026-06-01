import * as nexus from '@common/nexus/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface IstioGatewayComponentArgsShape {
  namespace: string;
  apexCaptainCloudflareZoneName: string;
  letsEncryptProdClusterIssuerName: string;
  letsEncryptStagingClusterIssuerName: string;
  istioIngressGatewayLabel: string;
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type IstioGatewayComponentArgs =
  utils.types.DeepPulumiInput<IstioGatewayComponentArgsShape>;

export const IstioGatewayComponent = nexus.function.defineComponent(
  'istioGateway',
  (args: IstioGatewayComponentArgs, opts: pulumi.ComponentResourceOptions) => {
    // Certificate
    const istioIngressGatewayWildcardProdCertSecretName =
      'istio-ingressgateway-wildcard-prod-cert';
    const istioIngressGatewayWildcardProdCertificate =
      new nexus.crd.certManager.CertificateV1Crd(
        'istioIngressGatewayProductionCertificate',
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
      new nexus.crd.certManager.CertificateV1Crd(
        'istioIngressGatewayStagingCertificate',
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
    const istioIngressGateway = new nexus.crd.istio.GatewayV1Crd(
      'istioIngressGateway',
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

    return {
      output: pulumi.output({ istioIngressGatewayPath }),
      secret: pulumi.secret({}),
    };
  },
);
