import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface RedisReplicationV1Beta2ArgsShape {
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    clusterSize: number;
    podSecurityContext?: {
      runAsUser?: number;
      fsGroup?: number;
    };
    kubernetesConfig: {
      image: string;
      imagePullPolicy?: string;
      redisSecret?: {
        name: string;
        key: string;
      };
      resources?: {
        requests?: Record<string, string>;
        limits?: Record<string, string>;
      };
    };
    acl?: {
      secret: {
        secretName: string;
      };
    };
    storage?: {
      volumeClaimTemplate?: {
        spec: {
          storageClassName?: string;
          accessModes: string[];
          resources: {
            requests: {
              storage: string;
            };
          };
        };
      };
    };
  };
}

export type RedisReplicationV1Beta2Args =
  utils.types.DeepPulumiInput<RedisReplicationV1Beta2ArgsShape>;

export class RedisReplicationV1Beta2 extends kubernetes.apiextensions.CustomResource {
  constructor(
    name: string,
    args: RedisReplicationV1Beta2Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(
      name,
      {
        apiVersion: 'redis.redis.opstreelabs.in/v1beta2',
        kind: 'RedisReplication',
        ...args,
      },
      opts,
    );
  }
}
