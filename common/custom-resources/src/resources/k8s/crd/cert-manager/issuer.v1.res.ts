import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface IssuerV1ArgsShape {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    acme?: {
      server: string;
      email: string;
      privateKeySecretRef: {
        name: string;
      };
      solvers?: {
        http01?: {
          ingress?: {
            class?: string;
          };
        };
        dns01?: {
          cloudflare?: {
            email: string;
            apiTokenSecretRef: {
              name: string;
              key: string;
            };
          };
        };
      }[];
    };
    ca?: {
      secretName: string;
    };
    selfSigned?: {};
    vault?: {
      server: string;
      path: string;
      auth: {
        kubernetes?: {
          mountPath: string;
          role: string;
          secretRef: {
            name: string;
            key: string;
          };
        };
        tokenSecretRef?: {
          name: string;
          key: string;
        };
      };
    };
    venafi?: {
      zone: string;
      tpp?: {
        url: string;
        credentialsRef: {
          name: string;
        };
        caBundle?: string;
      };
      cloud?: {
        url: string;
        apiTokenSecretRef: {
          name: string;
          key: string;
        };
      };
    };
  };
}

export type IssuerV1Args = utils.types.DeepPulumiInput<IssuerV1ArgsShape>;

export class IssuerV1 extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: IssuerV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'cert-manager.io/v1',
        kind: 'Issuer',
        ...args,
      },
      opts,
    );
  }
}
