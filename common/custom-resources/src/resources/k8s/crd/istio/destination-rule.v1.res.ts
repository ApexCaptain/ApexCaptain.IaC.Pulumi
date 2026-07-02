import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface DestinationRuleV1ArgsShape {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    host: string;
    trafficPolicy?: {
      portLevelSettings?: {
        port: {
          number: number;
        };
        tls?: {
          mode?: 'DISABLE' | 'SIMPLE' | 'MUTUAL' | 'ISTIO_MUTUAL';
          sni?: string;
          credentialName?: string;
          caCertificates?: string;
          insecureSkipVerify?: boolean;
        };
      }[];
      tls?: {
        mode?: 'DISABLE' | 'SIMPLE' | 'MUTUAL' | 'ISTIO_MUTUAL';
        sni?: string;
        credentialName?: string;
        caCertificates?: string;
        insecureSkipVerify?: boolean;
      };
    };
    exportTo?: string[];
  };
}

export type DestinationRuleV1Args =
  utils.types.DeepPulumiInput<DestinationRuleV1ArgsShape>;

export class DestinationRuleV1 extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: DestinationRuleV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'networking.istio.io/v1beta1',
        kind: 'DestinationRule',
        ...args,
      },
      opts,
    );
  }
}
