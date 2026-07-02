/**
 * Vikunja 기반 인프라 — namespace, CNPG PostgreSQL.
 *
 * Bitnami subchart 대신 CloudNativePG Cluster CRD로 DB를 띄운다.
 * namespace는 ambient mesh, PG pod는 `istio.io/dataplane-mode: none` (mesh 제외).
 *
 * Helm chart는 이 컴포넌트의 secret 출력(CNPG rw FQDN, auth secret)에 dependsOn 한다.
 */
import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';

interface VikunjaBaseComponentArgsShape {
  pvc: {
    postgresqlCluster: {
      storageClass: string;
      size: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type VikunjaBaseComponentArgs =
  utils.types.DeepPulumiInput<VikunjaBaseComponentArgsShape>;

export const VikunjaBaseComponent = utils.functions.defineComponent(
  'vikunjaBase',
  (
    args: VikunjaBaseComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    // ambient: Vikunja pod는 mesh 안. PG는 inheritedMetadata로 none.
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'vikunja',
          labels: {
            'istio.io/dataplane-mode': 'ambient',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // CNPG bootstrap.initdb — kubernetes.io/basic-auth (username + password)
    const postgresqlUsername = 'vikunja';
    const postgresqlDatabase = 'vikunja';
    const postgresqlPassword = new random.RandomPassword(
      `${resourceName}-postgresqlPassword`,
      {
        length: 32,
        special: false,
      },
    );
    const postgresqlAuthSecretUsernameKey = 'username';
    const postgresqlAuthSecretPasswordKey = 'password';

    const posgresqlAuthSecret = new kubernetes.core.v1.Secret(
      `${resourceName}-postgresqlAuthSecret`,
      {
        metadata: {
          name: 'postgresql-auth',
          namespace: namespace.metadata.name,
        },
        stringData: {
          [postgresqlAuthSecretUsernameKey]: postgresqlUsername,
          [postgresqlAuthSecretPasswordKey]: postgresqlPassword.result,
        },
        type: 'kubernetes.io/basic-auth',
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [namespace],
      },
    );

    const postgresqlClusterName = 'vikunja-postgresql-cluster';
    const postgresqlCluster =
      new customResources.resources.k8s.crd.cnpg.ClusterV1(
        `${resourceName}-postgresqlCluster`,
        {
          metadata: {
            name: postgresqlClusterName,
            namespace: namespace.metadata.name,
          },
          spec: {
            instances: 1,
            bootstrap: {
              initdb: {
                database: postgresqlDatabase,
                owner: postgresqlUsername,
                secret: {
                  name: posgresqlAuthSecret.metadata.name,
                },
              },
            },
            storage: {
              size: args.pvc.postgresqlCluster.size,
              storageClass: args.pvc.postgresqlCluster.storageClass,
            },
            inheritedMetadata: {
              labels: {
                // PG는 sidecar 없이 동작 — ambient ztunnel 제외
                'istio.io/dataplane-mode': 'none',
              },
            },
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
          dependsOn: [posgresqlAuthSecret],
        },
      );

    const postgresqlReadWriteFqdn = pulumi.interpolate`${postgresqlClusterName}-rw.${namespace.metadata.name}.svc.cluster.local`;

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
      }),
      secret: pulumi.secret({
        postgresqlDatabase,
        postgresqlReadWriteFqdn,
        postgresqlAuthSecretName: posgresqlAuthSecret.metadata.name,
        postgresqlAuthSecretUsernameKey,
        postgresqlAuthSecretPasswordKey,
      }),
    };
  },
);
