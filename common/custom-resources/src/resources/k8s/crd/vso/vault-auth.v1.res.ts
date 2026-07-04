import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface VaultAuthV1KubernetesShape {
  role: string;
  serviceAccount: string;
  tokenAudiences?: string[];
  tokenExpirationSeconds?: number;
  namespace?: string;
  mount?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

interface VaultAuthV1AppRoleShape {
  roleId: string;
  secretRef: string;
  mount?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

interface VaultAuthV1JwtShape {
  role: string;
  secretRef?: string;
  serviceAccount?: string;
  tokenAudiences?: string[];
  tokenExpirationSeconds?: number;
  mount?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

interface VaultAuthV1TokenShape {
  tokenSecretRef: string;
  mount?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

interface VaultAuthV1GlobalRefShape {
  name: string;
  namespace?: string;
  allowDefault?: boolean;
  mergeStrategy?: {
    headers?: 'replace' | 'union';
    params?: 'replace' | 'union';
  };
}

interface VaultAuthV1ArgsShape {
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    vaultConnectionRef?: string;
    vaultAuthGlobalRef?: VaultAuthV1GlobalRefShape;
    namespace?: string;
    method: string;
    mount: string;
    allowedNamespaces?: string[];
    kubernetes?: VaultAuthV1KubernetesShape;
    appRole?: VaultAuthV1AppRoleShape;
    jwt?: VaultAuthV1JwtShape;
    token?: VaultAuthV1TokenShape;
  };
}

export type VaultAuthV1Args = utils.types.DeepPulumiInput<VaultAuthV1ArgsShape>;

export class VaultAuthV1 extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: VaultAuthV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'secrets.hashicorp.com/v1beta1',
        kind: 'VaultAuth',
        ...args,
      },
      opts,
    );
  }
}
