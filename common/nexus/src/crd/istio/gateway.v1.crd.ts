import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface GatewayV1CrdArgsShape {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    selector: Record<string, string>;
    servers: {
      name?: string;
      bind?: string;
      defaultEndpoint?: string;
      port: {
        number: number;
        name: string;
        protocol: string;
        targetPort?: number;
      };
      hosts: string[];
      tls?: {
        mode?:
          | 'PASSTHROUGH'
          | 'SIMPLE'
          | 'MUTUAL'
          | 'AUTO_PASSTHROUGH'
          | 'ISTIO_MUTUAL'
          | 'OPTIONAL_MUTUAL';
        credentialName?: string;
        credentialNames?: string[];
        minProtocolVersion?:
          | 'TLS_AUTO'
          | 'TLSV1_0'
          | 'TLSV1_1'
          | 'TLSV1_2'
          | 'TLSV1_3';
        maxProtocolVersion?:
          | 'TLS_AUTO'
          | 'TLSV1_0'
          | 'TLSV1_1'
          | 'TLSV1_2'
          | 'TLSV1_3';
        caCertificates?: string;
        caCrl?: string;
        privateKey?: string;
        serverCertificate?: string;
        subjectAltNames?: string[];
        cipherSuites?: string[];
        httpsRedirect?: boolean;
        tlsCertificates?: {
          caCertificates?: string;
          privateKey?: string;
          serverCertificate?: string;
        }[];
        verifyCertificateHash?: string[];
        verifyCertificateSpki?: string[];
      };
    }[];
  };
}

export type GatewayV1CrdArgs =
  utils.types.DeepPulumiInput<GatewayV1CrdArgsShape>;

export class GatewayV1Crd extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: GatewayV1CrdArgs,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'networking.istio.io/v1beta1',
        kind: 'Gateway',
        metadata: args.metadata,
        spec: args.spec,
      },
      opts,
    );
  }
}
