import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface ClusterIssuerV1CrdArgsShape {
  metadata: {
    name: string;
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

export type ClusterIssuerV1CrdArgs =
  utils.types.DeepPulumiInput<ClusterIssuerV1CrdArgsShape>;

export class ClusterIssuerV1Crd
  extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: ClusterIssuerV1CrdArgs,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'cert-manager.io/v1',
        kind: 'ClusterIssuer',
        metadata: args.metadata,
        spec: args.spec,
      },
      opts,
    );
  }
}
