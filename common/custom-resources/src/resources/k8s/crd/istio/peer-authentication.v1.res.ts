import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface PeerAuthenticationV1ArgsShape {
  metadata: {
    name: string;
    namespace?: string;
  };
  spec?: {
    mtls?: {
      mode?: 'UNSET' | 'DISABLE' | 'PERMISSIVE' | 'STRICT';
      clientCertificate?: string;
      privateKey?: string;
      caCertificates?: string;
    };
    selector?: {
      matchLabels?: Record<string, string>;
    };
    portLevelMtls?: Record<
      string,
      {
        mode?: 'UNSET' | 'DISABLE' | 'PERMISSIVE' | 'STRICT';
      }
    >;
  };
}

export type PeerAuthenticationV1Args =
  utils.types.DeepPulumiInput<PeerAuthenticationV1ArgsShape>;

export class PeerAuthenticationV1
  extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: PeerAuthenticationV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'security.istio.io/v1beta1',
        kind: 'PeerAuthentication',
        ...args,
      },
      opts,
    );
  }
}
