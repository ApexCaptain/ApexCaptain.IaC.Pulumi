import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface AuthorizationPolicyV1ArgsShape {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    selector?: {
      matchLabels?: Record<string, string>;
    };
    action?: 'ALLOW' | 'DENY' | 'AUDIT' | 'CUSTOM';
    rules?: {
      from?: {
        source?: {
          principals?: string[];
          notPrincipals?: string[];
          requestPrincipals?: string[];
          notRequestPrincipals?: string[];
          namespaces?: string[];
          notNamespaces?: string[];
          ipBlocks?: string[];
          notIpBlocks?: string[];
          remoteIpBlocks?: string[];
          notRemoteIpBlocks?: string[];
        };
      }[];
      to?: {
        operation?: {
          hosts?: string[];
          notHosts?: string[];
          ports?: string[];
          notPorts?: string[];
          methods?: string[];
          notMethods?: string[];
          paths?: string[];
          notPaths?: string[];
        };
      }[];
      when?: {
        key?: string;
        notKey?: string;
        values?: string[];
        notValues?: string[];
      }[];
    }[];
    provider?: {
      name?: string;
    };
  };
}

export type AuthorizationPolicyV1Args =
  utils.types.DeepPulumiInput<AuthorizationPolicyV1ArgsShape>;

export class AuthorizationPolicyV1
  extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: AuthorizationPolicyV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'security.istio.io/v1',
        kind: 'AuthorizationPolicy',
        ...args,
      },
      opts,
    );
  }
}
