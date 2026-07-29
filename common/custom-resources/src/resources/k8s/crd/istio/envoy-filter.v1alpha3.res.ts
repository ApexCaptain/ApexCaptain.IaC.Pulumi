import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface EnvoyFilterV1Alpha3ArgsShape {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    workloadSelector?: {
      labels?: Record<string, string>;
    };
    priority?: number;
    configPatches: {
      applyTo:
        | 'INVALID'
        | 'LISTENER'
        | 'FILTER_CHAIN'
        | 'NETWORK_FILTER'
        | 'HTTP_FILTER'
        | 'ROUTE_CONFIGURATION'
        | 'VIRTUAL_HOST'
        | 'HTTP_ROUTE'
        | 'CLUSTER'
        | 'EXTENSION_CONFIG'
        | 'BOOTSTRAP'
        | 'LISTENER_FILTER';
      match?: {
        context?: 'ANY' | 'SIDECAR_INBOUND' | 'SIDECAR_OUTBOUND' | 'GATEWAY';
        proxy?: {
          proxyVersion?: string;
          metadata?: Record<string, string>;
        };
        listener?: {
          portNumber?: number;
          filterChain?: {
            name?: string;
            sni?: string;
            transportProtocol?: string;
            applicationProtocols?: string;
            filter?: {
              name?: string;
              subFilter?: {
                name?: string;
              };
            };
          };
          name?: string;
        };
        routeConfiguration?: {
          portNumber?: number;
          portName?: string;
          gateway?: string;
          name?: string;
          vhost?: {
            name?: string;
            route?: {
              name?: string;
              action?:
                | 'ANY'
                | 'ROUTE'
                | 'REDIRECT'
                | 'DIRECT_RESPONSE';
            };
          };
        };
        cluster?: {
          portNumber?: number;
          service?: string;
          subset?: string;
          name?: string;
        };
      };
      patch: {
        operation:
          | 'INVALID'
          | 'MERGE'
          | 'ADD'
          | 'REMOVE'
          | 'INSERT_BEFORE'
          | 'INSERT_AFTER'
          | 'INSERT_FIRST'
          | 'REPLACE';
        // Envoy 설정 조각은 자유 형식이라 느슨하게 둔다
        value?: Record<string, any>;
        filterClass?: 'UNSPECIFIED' | 'AUTHN' | 'AUTHZ' | 'STATS';
      };
    }[];
  };
}

export type EnvoyFilterV1Alpha3Args =
  utils.types.DeepPulumiInput<EnvoyFilterV1Alpha3ArgsShape>;

export class EnvoyFilterV1Alpha3 extends kubernetes.apiextensions
  .CustomResource {
  constructor(
    name: string,
    args: EnvoyFilterV1Alpha3Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'networking.istio.io/v1alpha3',
        kind: 'EnvoyFilter',
        ...args,
      },
      opts,
    );
  }
}
