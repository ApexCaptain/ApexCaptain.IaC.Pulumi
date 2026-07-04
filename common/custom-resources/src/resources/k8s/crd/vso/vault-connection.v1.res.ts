import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface VaultConnectionV1ArgsShape {
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    address: string;
    skipTLSVerify?: boolean;
    caCertSecretRef?: string;
    caCertPath?: string;
    tlsServerName?: string;
    timeout?: string;
    headers?: Record<string, string>;
  };
}

export type VaultConnectionV1Args =
  utils.types.DeepPulumiInput<VaultConnectionV1ArgsShape>;

export class VaultConnectionV1 extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: VaultConnectionV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'secrets.hashicorp.com/v1beta1',
        kind: 'VaultConnection',
        ...args,
      },
      opts,
    );
  }
}
