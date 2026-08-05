import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';
import { CoderWorkspaceMeshProxyComponent } from './coder.workspace-mesh-proxy.component';

interface CoderBaseComponentArgsShape {
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

export type CoderBaseComponentArgs =
  utils.types.DeepPulumiInput<CoderBaseComponentArgsShape>;

export const CoderBaseComponent = utils.functions.defineComponent(
  'coderBase',
  (
    args: CoderBaseComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    // Namespaces
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'coder',
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

    const sysboxUbuntuNamespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-sysboxUbuntuNamespace`,
      {
        metadata: {
          name: 'coder-sysbox-ubuntu',
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

    const sysboxUbuntuTestNamespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-sysboxUbuntuTestNamespace`,
      {
        metadata: {
          name: 'coder-sysbox-ubuntu-test',
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

    const sysboxUbuntuMeshProxy = new CoderWorkspaceMeshProxyComponent(
      'coderWorkspaceMeshProxy',
      {
        namespace: sysboxUbuntuNamespace.metadata.name,
        providers: {
          kubernetes: args.providers.kubernetes,
        },
      },
      {
        ...opts,
        dependsOn: [sysboxUbuntuNamespace],
      },
    );

    const sysboxUbuntuTestMeshProxy = new CoderWorkspaceMeshProxyComponent(
      'coderWorkspaceTestMeshProxy',
      {
        namespace: sysboxUbuntuTestNamespace.metadata.name,
        providers: {
          kubernetes: args.providers.kubernetes,
        },
      },
      {
        ...opts,
        aliases: [{ parent: pulumi.rootStackResource }],
        dependsOn: [sysboxUbuntuTestNamespace],
      },
    );

    // Postgresql Cluster
    const postgresqlUsername = 'coder';
    const postgresqlDatabase = 'coder';
    const postgresqlPassword = new random.RandomPassword(
      `${resourceName}-postgresqlPassword`,
      {
        length: 32,
        special: false,
      },
      {
        ...opts,
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

    const postgresqlClusterName = 'coder-postgresql-cluster';
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
            // idle ~79Mi
            resources: {
              requests: {
                cpu: '100m',
                memory: '128Mi',
              },
              limits: {
                cpu: '500m',
                memory: '512Mi',
              },
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
    const postgresqlUrlSecretKey = 'postgresql-url';
    const postgresqlUrlSecret = new kubernetes.core.v1.Secret(
      `${resourceName}-postgresqlUrlSecret`,
      {
        metadata: {
          name: 'postgresql-url',
          namespace: namespace.metadata.name,
        },
        stringData: {
          [postgresqlUrlSecretKey]: pulumi.interpolate`postgresql://${postgresqlUsername}:${postgresqlPassword.result}@${postgresqlReadWriteFqdn}/${postgresqlDatabase}?sslmode=require`,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [postgresqlCluster],
      },
    );

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
        sysboxUbuntuNamespace: sysboxUbuntuNamespace.metadata.name,
        sysboxUbuntuTestNamespace: sysboxUbuntuTestNamespace.metadata.name,
        meshProxies: {
          sysboxUbuntu: sysboxUbuntuMeshProxy.output,
          sysboxUbuntuTest: sysboxUbuntuTestMeshProxy.output,
        },
      }),
      secret: pulumi.secret({
        postgresqlDatabase,
        postgresqlReadWriteFqdn,
        postgresqlAuthSecretName: posgresqlAuthSecret.metadata.name,
        postgresqlAuthSecretUsernameKey,
        postgresqlAuthSecretPasswordKey,
        postgresqlUrlSecretName: postgresqlUrlSecret.metadata.name,
        postgresqlUrlSecretKey,
      }),
    };
  },
);
