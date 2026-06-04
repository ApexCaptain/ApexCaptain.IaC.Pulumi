import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface CertificateV1ArgsShape {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    secretName: string;
    issuerRef: {
      name: string;
      kind: string;
      group?: string;
    };
    dnsNames?: string[];
    commonName?: string;
    subject?: {
      countries?: string[];
      provinces?: string[];
      localities?: string[];
      organizationalUnits?: string[];
      organizations?: string[];
      streetAddresses?: string[];
      postalCodes?: string[];
      serialNumber?: string;
    };
    usages?: string[];
    keySize?: number;
    keyAlgorithm?: string;
    keyEncoding?: string;
    duration?: string;
    renewBefore?: string;
    isCA?: boolean;
    secretTemplate?: {
      annotations?: Record<string, string>;
      labels?: Record<string, string>;
    };
    additionalOutputFormats?: {
      type: string;
      key?: {
        secretName: string;
        key: string;
      };
    }[];
  };
}

export type CertificateV1Args =
  utils.types.DeepPulumiInput<CertificateV1ArgsShape>;

export class CertificateV1 extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: CertificateV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'cert-manager.io/v1',
        kind: 'Certificate',
        ...args,
      },
      opts,
    );
  }
}
