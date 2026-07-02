/**
 * Authentik Helm — IdP 본체
 *
 * namespace에 `istio-injection: enabled` (레거시 라벨이지만 ambient와 공존).
 * PostgreSQL PVC는 Longhorn SSD SC — 그래서 longhornResources 이후에 배포한다.
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as time from '@pulumiverse/time';

interface AuthentikHelmChartComponentArgsShape {
  namespace: string;
  helm: {
    authentik: {
      version: string;
      repositoryUrl: string;
    };
  };
  secretKey: string;
  host: string;
  secrets: {
    bootstrap: {
      token: string;
      email: string;
      password: string;
    };
    postgresqlPassword: string;
  };
  pvc: {
    postgresql: {
      storageClass: string;
      size: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type AuthentikHelmChartComponentArgs =
  utils.types.DeepPulumiInput<AuthentikHelmChartComponentArgsShape>;

export const AuthentikHelmChartComponent = utils.functions.defineComponent(
  'authentikHelmChart',
  (
    args: AuthentikHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: args.namespace,
          labels: {
            'istio-injection': 'enabled',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // Secrets
    const authentikBootstrapTokenSecret = new kubernetes.core.v1.Secret(
      `${resourceName}-authentikBootstrapTokenSecret`,
      {
        metadata: {
          name: 'authentik-bootstrap-token',
          namespace: namespace.metadata.name,
        },
        stringData: {
          AUTHENTIK_BOOTSTRAP_EMAIL: args.secrets.bootstrap.email,
          AUTHENTIK_BOOTSTRAP_TOKEN: args.secrets.bootstrap.token,
          AUTHENTIK_BOOTSTRAP_PASSWORD: args.secrets.bootstrap.password,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const authentikPostgresqlPasswordSecretKey =
      'AUTHENTIK_POSTGRESQL_PASSWORD';
    const authentikPostgresqlPasswordSecret = new kubernetes.core.v1.Secret(
      `${resourceName}-authentikPostgresqlPasswordSecret`,
      {
        metadata: {
          name: 'authentik-postgresql-password',
          namespace: namespace.metadata.name,
        },
        stringData: {
          [authentikPostgresqlPasswordSecretKey]:
            args.secrets.postgresqlPassword,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // Configuration
    const authentikServiceAccountName = 'authentik';
    const authentikPostgresqlCredSecretName = 'postgres-cred';
    const authentikPostgresqlCredSecretMountPath = '/postgres-creds';
    const authentikServerServiceName = 'authentik-server';
    const authentikServerServiceHttpPort = 80;

    // Helm Chart
    const authentikRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-authentikRelease`,
      {
        name: 'authentik',
        chart: 'authentik',
        version: args.helm.authentik.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.authentik.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          global: {
            envFrom: [
              {
                secretRef: {
                  name: authentikBootstrapTokenSecret.metadata.name,
                },
              },
            ],
          },

          authentik: {
            secret_key: args.secretKey,
            postgresql: {
              password: `file://${authentikPostgresqlCredSecretMountPath}/${authentikPostgresqlPasswordSecretKey}`,
            },
          },
          server: {
            serviceAccountName: authentikServiceAccountName,
            service: {
              servicePortHttp: authentikServerServiceHttpPort,
            },
            env: [
              {
                name: 'AUTHENTIK_HOST',
                value: pulumi.interpolate`https://${args.host}`,
              },
            ],
            volumes: [
              {
                name: authentikPostgresqlCredSecretName,
                secret: {
                  secretName: authentikPostgresqlPasswordSecret.metadata.name,
                },
              },
              {
                name: 'shm',
                emptyDir: {
                  medium: 'Memory',
                  sizeLimit: '512Mi',
                },
              },
            ],
            volumeMounts: [
              {
                name: authentikPostgresqlCredSecretName,
                mountPath: authentikPostgresqlCredSecretMountPath,
                readOnly: true,
              },
              {
                name: 'shm',
                mountPath: '/dev/shm',
              },
            ],
          },
          worker: {
            volumes: [
              {
                name: authentikPostgresqlCredSecretName,
                secret: {
                  secretName: authentikPostgresqlPasswordSecret.metadata.name,
                },
              },
            ],
            volumeMounts: [
              {
                name: authentikPostgresqlCredSecretName,
                mountPath: authentikPostgresqlCredSecretMountPath,
                readOnly: true,
              },
            ],
          },
          postgresql: {
            enabled: true,
            auth: {
              existingSecret: authentikPostgresqlPasswordSecret.metadata.name,
              secretKeys: {
                userPasswordKey: authentikPostgresqlPasswordSecretKey,
              },
            },
            primary: {
              persistence: {
                enabled: true,
                storageClass: args.pvc.postgresql.storageClass,
                size: args.pvc.postgresql.size,
              },
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [
          authentikBootstrapTokenSecret,
          authentikPostgresqlPasswordSecret,
        ],
      },
    );

    const authentikReleasePropagationDelay = new time.Sleep(
      `${resourceName}-authentikReleasePropagationDelay`,
      {
        createDuration: '90s',
      },
      {
        ...opts,
        dependsOn: [authentikRelease],
      },
    );

    // RBAC
    const authentikRole = new kubernetes.rbac.v1.Role(
      `${resourceName}-authentikRole`,
      {
        metadata: {
          name: 'authentik-role',
          namespace: namespace.metadata.name,
        },
        rules: [
          {
            apiGroups: [''],
            resources: ['pods', 'services', 'secrets'],
            verbs: [
              'get',
              'list',
              'watch',
              'create',
              'update',
              'patch',
              'delete',
            ],
          },
          {
            apiGroups: ['apps'],
            resources: ['deployments', 'statefulsets'],
            verbs: [
              'get',
              'list',
              'watch',
              'create',
              'update',
              'patch',
              'delete',
            ],
          },
        ],
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [namespace, authentikReleasePropagationDelay],
      },
    );

    const authentikRoleBinding = new kubernetes.rbac.v1.RoleBinding(
      `${resourceName}-authentikRoleBinding`,
      {
        metadata: {
          name: 'authentik-role-binding',
          namespace: namespace.metadata.name,
        },
        roleRef: {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: 'Role',
          name: authentikRole.metadata.name,
        },
        subjects: [
          {
            kind: 'ServiceAccount',
            name: authentikServiceAccountName,
            namespace: namespace.metadata.name,
          },
        ],
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [authentikRole, authentikRelease],
      },
    );

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,

        services: {
          authentik: {
            name: authentikServerServiceName,
            port: {
              http: authentikServerServiceHttpPort,
            },
          },
        },
      }),
      secret: pulumi.secret({
        authentikProviderConfig: {
          url: pulumi.interpolate`https://${args.host}`,
          token: args.secrets.bootstrap.token,
        },
      }),
    };
  },
);
