/**
 * Argo CD용 RedisReplication (OT Operator).
 * Helm 내장 redis 대신 master Service로 연결한다.
 */
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import { buildRedisDefaultAclUserLine } from './argo.redis-acl';

export const ARGO_CD_REDIS_REPLICATION_NAME = 'argo-cd-redis';
export const ARGO_CD_REDIS_AUTH_SECRET_NAME = 'argo-cd-redis-auth';
export const ARGO_CD_REDIS_ACL_SECRET_NAME = 'argo-cd-redis-acl';
const ARGO_CD_REDIS_PORT = 6379;

interface ArgoCdRedisResourcesArgsShape {
  namespace: string;
  password: string;
  storageClass: string;
}

export type ArgoCdRedisResourcesArgs =
  utils.types.DeepPulumiInput<ArgoCdRedisResourcesArgsShape> & {
    provider: kubernetes.Provider;
  };

export interface ArgoCdRedisResourcesResult {
  masterHost: pulumi.Output<string>;
  port: number;
  authSecretName: string;
  dependsOn: pulumi.Resource[];
}

export function createArgoCdRedisResources(
  resourceName: string,
  args: ArgoCdRedisResourcesArgs,
  opts: pulumi.ComponentResourceOptions,
): ArgoCdRedisResourcesResult {
  const providerOpts: pulumi.CustomResourceOptions = {
    ...opts,
    provider: args.provider,
  };

  const redisAuthSecret = new kubernetes.core.v1.Secret(
    `${resourceName}-redisAuthSecret`,
    {
      metadata: {
        name: ARGO_CD_REDIS_AUTH_SECRET_NAME,
        namespace: args.namespace,
        labels: {
          'app.kubernetes.io/name': ARGO_CD_REDIS_REPLICATION_NAME,
          'app.kubernetes.io/part-of': 'argo-cd',
        },
      },
      stringData: pulumi.output(args.password).apply((password: string) => ({
        password,
        'redis-password': password,
      })),
    },
    providerOpts,
  );

  const redisAclSecret = new kubernetes.core.v1.Secret(
    `${resourceName}-redisAclSecret`,
    {
      metadata: {
        name: ARGO_CD_REDIS_ACL_SECRET_NAME,
        namespace: args.namespace,
        labels: {
          'app.kubernetes.io/name': ARGO_CD_REDIS_REPLICATION_NAME,
          'app.kubernetes.io/part-of': 'argo-cd',
        },
      },
      stringData: pulumi.output(args.password).apply((password: string) => ({
        'user.acl': `${buildRedisDefaultAclUserLine(password)}\n`,
      })),
    },
    providerOpts,
  );

  const redisReplication =
    new customResources.resources.k8s.crd.redisOperator.RedisReplicationV1Beta2(
      `${resourceName}-redisReplication`,
      {
        metadata: {
          name: ARGO_CD_REDIS_REPLICATION_NAME,
          namespace: args.namespace,
          labels: {
            'app.kubernetes.io/name': ARGO_CD_REDIS_REPLICATION_NAME,
            'app.kubernetes.io/part-of': 'argo-cd',
          },
        },
        spec: {
          clusterSize: 1,
          podSecurityContext: {
            runAsUser: 1000,
            fsGroup: 1000,
          },
          kubernetesConfig: {
            image: utils.configs.containerImages.argoCdRedis,
            imagePullPolicy: 'IfNotPresent',
            redisSecret: {
              name: ARGO_CD_REDIS_AUTH_SECRET_NAME,
              key: 'password',
            },
            resources: {
              requests: {
                cpu: '20m',
                memory: '128Mi',
              },
              limits: {
                cpu: '200m',
                memory: '128Mi',
              },
            },
          },
          acl: {
            secret: {
              secretName: ARGO_CD_REDIS_ACL_SECRET_NAME,
            },
          },
          storage: {
            volumeClaimTemplate: {
              spec: {
                storageClassName: args.storageClass,
                accessModes: ['ReadWriteOnce'],
                resources: {
                  requests: {
                    storage: '1Gi',
                  },
                },
              },
            },
          },
        },
      },
      {
        ...providerOpts,
        dependsOn: [redisAuthSecret, redisAclSecret],
      },
    );

  const masterHost = pulumi
    .all([args.namespace])
    .apply(
      ([namespace]) =>
        `${ARGO_CD_REDIS_REPLICATION_NAME}-master.${namespace}.svc.cluster.local`,
    );

  return {
    masterHost,
    port: ARGO_CD_REDIS_PORT,
    authSecretName: ARGO_CD_REDIS_AUTH_SECRET_NAME,
    dependsOn: [redisAuthSecret, redisAclSecret, redisReplication],
  };
}
