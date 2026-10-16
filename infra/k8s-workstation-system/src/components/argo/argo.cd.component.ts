import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import yaml from 'yaml';
import { createArgoCdRedisResources } from './argo.cd.redis';

interface ArgoCdComponentArgsShape {
  host: string;
  bootstrapPasswordBcrypt: string;
  githubSecret: string;
  oidc: {
    name: string;
    issuerUrl: string;
    groupsClaim: string;
    requestedScopes: string[];
    clientId: string;
    clientSecret: string;
  };
  helm: {
    argoCd: {
      version: string;
      repositoryUrl: string;
    };
  };
  redis: {
    password: string;
    storageClass: string;
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type ArgoCdComponentArgs =
  utils.types.DeepPulumiInput<ArgoCdComponentArgsShape>;

const gitOpsProjects = {
  apps: {
    name: 'apps',
    accountName: 'gitops-apps-deployer',
    roleName: 'role:apps-deployer',
    readerRoleName: 'role:apps-reader',
    readerGroupName: 'argo-apps-reader',
  },
  tools: {
    name: 'tools',
    accountName: 'gitops-tools-deployer',
    roleName: 'role:tools-deployer',
    readerRoleName: 'role:tools-reader',
    readerGroupName: 'argo-tools-reader',
  },
} as const;

export const ArgoCdComponent = utils.functions.defineComponent(
  'argoCd',
  (
    args: ArgoCdComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'argo-cd',
          labels: {
            // @ToDo 일단 끄고, 이상 없으면 ambient로 전환 -> 이후 PA를 STRICT로 모드 격상
            'istio.io/dataplane-mode': 'none',
            'goldilocks.fairwinds.com/enabled': 'true',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const argoCdRedis = createArgoCdRedisResources(
      `${resourceName}-redis`,
      {
        namespace: namespace.metadata.name,
        password: args.redis.password,
        storageClass: args.redis.storageClass,
        provider: args.providers.kubernetes,
      },
      {
        ...opts,
        dependsOn: [namespace],
      },
    );

    const argoCdReleaseName = 'argo-cd';
    const argoCdHelmChartRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-argoCdHelmChartRelease`,
      {
        name: argoCdReleaseName,
        chart: 'argo-cd',
        namespace: namespace.metadata.name,
        version: args.helm.argoCd.version,
        repositoryOpts: {
          repo: args.helm.argoCd.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          global: {
            domain: args.host,
          },
          configs: {
            cm: {
              'url': pulumi.interpolate`https://${args.host}`,
              [`accounts.${gitOpsProjects.apps.accountName}`]: 'apiKey',
              [`accounts.${gitOpsProjects.tools.accountName}`]: 'apiKey',
              'oidc.config': pulumi
                .all([
                  args.oidc.name,
                  args.oidc.issuerUrl,
                  args.oidc.clientId,
                  args.oidc.requestedScopes,
                ])
                .apply(([name, issuerUrl, clientId, requestedScopes]) =>
                  yaml.stringify({
                    name,
                    issuer: issuerUrl,
                    clientID: clientId,
                    clientSecret: '$oidc.authentik.clientSecret',
                    requestedScopes,
                  }),
                ),
            },
            rbac: {
              'policy.csv': utils.functions.createArgoCdPolicyCsv({
                permissions: [
                  {
                    role: gitOpsProjects.apps.roleName,
                    resource: 'applications',
                    action: '*',
                    object: `${gitOpsProjects.apps.name}/*`,
                  },
                  {
                    role: gitOpsProjects.apps.roleName,
                    resource: 'applicationprojects',
                    action: 'get',
                    object: gitOpsProjects.apps.name,
                  },
                  {
                    role: gitOpsProjects.apps.readerRoleName,
                    resource: 'applications',
                    action: 'get',
                    object: `${gitOpsProjects.apps.name}/*`,
                  },
                  {
                    role: gitOpsProjects.apps.readerRoleName,
                    resource: 'applications',
                    action: 'sync',
                    object: `${gitOpsProjects.apps.name}/*`,
                  },
                  {
                    role: gitOpsProjects.apps.readerRoleName,
                    resource: 'applicationprojects',
                    action: 'get',
                    object: gitOpsProjects.apps.name,
                  },
                  {
                    role: gitOpsProjects.apps.readerRoleName,
                    resource: 'projects',
                    action: 'get',
                    object: gitOpsProjects.apps.name,
                  },
                  {
                    role: gitOpsProjects.apps.readerRoleName,
                    resource: 'logs',
                    action: 'get',
                    object: `${gitOpsProjects.apps.name}/*`,
                  },
                  {
                    role: gitOpsProjects.apps.readerRoleName,
                    resource: 'repositories',
                    action: 'get',
                    object: '*',
                  },
                  {
                    role: gitOpsProjects.tools.roleName,
                    resource: 'applications',
                    action: '*',
                    object: `${gitOpsProjects.tools.name}/*`,
                  },
                  {
                    role: gitOpsProjects.tools.roleName,
                    resource: 'applicationprojects',
                    action: 'get',
                    object: gitOpsProjects.tools.name,
                  },
                  {
                    role: gitOpsProjects.tools.readerRoleName,
                    resource: 'applications',
                    action: 'get',
                    object: `${gitOpsProjects.tools.name}/*`,
                  },
                  {
                    role: gitOpsProjects.tools.readerRoleName,
                    resource: 'applications',
                    action: 'sync',
                    object: `${gitOpsProjects.tools.name}/*`,
                  },
                  {
                    role: gitOpsProjects.tools.readerRoleName,
                    resource: 'applicationprojects',
                    action: 'get',
                    object: gitOpsProjects.tools.name,
                  },
                  {
                    role: gitOpsProjects.tools.readerRoleName,
                    resource: 'projects',
                    action: 'get',
                    object: gitOpsProjects.tools.name,
                  },
                  {
                    role: gitOpsProjects.tools.readerRoleName,
                    resource: 'logs',
                    action: 'get',
                    object: `${gitOpsProjects.tools.name}/*`,
                  },
                  {
                    role: gitOpsProjects.tools.readerRoleName,
                    resource: 'repositories',
                    action: 'get',
                    object: '*',
                  },
                ],
                bindings: [
                  {
                    subject: gitOpsProjects.apps.accountName,
                    role: gitOpsProjects.apps.roleName,
                  },
                  {
                    subject: gitOpsProjects.tools.accountName,
                    role: gitOpsProjects.tools.roleName,
                  },
                  {
                    subject: gitOpsProjects.apps.readerGroupName,
                    role: gitOpsProjects.apps.readerRoleName,
                  },
                  {
                    subject: gitOpsProjects.tools.readerGroupName,
                    role: gitOpsProjects.tools.readerRoleName,
                  },
                ],
              }),
              'scopes': pulumi
                .output(args.oidc.groupsClaim)
                .apply(groupsClaim => `[${groupsClaim}]`),
            },
            params: {
              'server.insecure': true,
            },
            secret: {
              argocdServerAdminPassword: args.bootstrapPasswordBcrypt,
              githubSecret: args.githubSecret,
              extra: {
                'oidc.authentik.clientSecret': args.oidc.clientSecret,
              },
            },
          },
          controller: {
            // VPA 2026-10-12: target 175Mi / upper 181Mi
            resources: {
              requests: {
                cpu: '50m',
                memory: '192Mi',
              },
              limits: {
                cpu: '500m',
                memory: '256Mi',
              },
            },
          },
          server: {
            // VPA 2026-10-12: target 156Mi / upper 181Mi
            resources: {
              requests: {
                cpu: '50m',
                memory: '192Mi',
              },
              limits: {
                cpu: '500m',
                memory: '256Mi',
              },
            },
          },
          repoServer: {
            // VPA 2026-10-12: target 100Mi / upper 100Mi. git fetch 여유는 limit에만
            resources: {
              requests: {
                cpu: '50m',
                memory: '128Mi',
              },
              limits: {
                cpu: '500m',
                memory: '256Mi',
              },
            },
          },
          redis: {
            enabled: false,
          },
          redisSecretInit: {
            enabled: false,
          },
          externalRedis: {
            host: argoCdRedis.masterHost,
            port: argoCdRedis.port,
            existingSecret: argoCdRedis.authSecretName,
          },
          applicationSet: {
            // VPA 2026-10: target ~272Mi
            resources: {
              requests: {
                cpu: '20m',
                memory: '320Mi',
              },
              limits: {
                cpu: '200m',
                memory: '384Mi',
              },
            },
          },
          dex: {
            // VPA 2026-10-12: target 237Mi / upper 245Mi
            resources: {
              requests: {
                cpu: '20m',
                memory: '256Mi',
              },
              limits: {
                cpu: '200m',
                memory: '320Mi',
              },
            },
          },
          notifications: {
            // VPA 2026-10-12: target 156Mi / upper 161Mi. 이전 limit이 target보다 낮았음
            resources: {
              requests: {
                cpu: '20m',
                memory: '192Mi',
              },
              limits: {
                cpu: '200m',
                memory: '256Mi',
              },
            },
          },
        },
      },
      {
        ...opts,
        dependsOn: [namespace, ...argoCdRedis.dependsOn],
        provider: args.providers.kubernetes,
      },
    );

    const argoCdServerService = `${argoCdReleaseName}-argocd-server`;

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
        services: {
          argoCdServer: {
            name: argoCdServerService,
            port: {
              webUi: 80, // @Note Cloudflare의 TLS를 쓸 거라 그냥 80으로 넘겨도 무방
            },
          },
        },
        projects: {
          apps: {
            name: gitOpsProjects.apps.name,
            accountName: gitOpsProjects.apps.accountName,
            readerGroupName: gitOpsProjects.apps.readerGroupName,
          },
          tools: {
            name: gitOpsProjects.tools.name,
            accountName: gitOpsProjects.tools.accountName,
            readerGroupName: gitOpsProjects.tools.readerGroupName,
          },
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
