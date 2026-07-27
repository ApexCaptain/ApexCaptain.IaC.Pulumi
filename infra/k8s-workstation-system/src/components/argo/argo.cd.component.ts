import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as std from '@pulumi/std';

interface ArgoCdComponentArgsShape {
  host: string;
  bootstrapPassword: string;
  githubSecret: string;
  helm: {
    argoCd: {
      version: string;
      repositoryUrl: string;
    };
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
  },
  tools: {
    name: 'tools',
    accountName: 'gitops-tools-deployer',
    roleName: 'role:tools-deployer',
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
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
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
              [`accounts.${gitOpsProjects.apps.accountName}`]: 'apiKey',
              [`accounts.${gitOpsProjects.tools.accountName}`]: 'apiKey',
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
                ],
              }),
            },
            params: {
              'server.insecure': true,
            },
            secret: {
              argocdServerAdminPassword: std.bcryptOutput({
                input: args.bootstrapPassword,
                cost: 10,
              }).result,
              githubSecret: args.githubSecret,
            },
          },
        },
      },
      {
        ...opts,
        dependsOn: [namespace],
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
          },
          tools: {
            name: gitOpsProjects.tools.name,
            accountName: gitOpsProjects.tools.accountName,
          },
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
