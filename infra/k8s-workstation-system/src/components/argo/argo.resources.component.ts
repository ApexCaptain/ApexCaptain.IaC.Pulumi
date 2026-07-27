import { argocd } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';

interface ArgoResourcesComponentArgsShape {
  namespace: string;
  gitOpsRepository: {
    name: string;
    sshCloneUrl: string;
    deployPrivateKeyPem: string;
  };
  gitOpsProjects: {
    apps: {
      name: string;
      accountName: string;
    };
    tools: {
      name: string;
      accountName: string;
    };
  };
  providers: {
    argocd: argocd.Provider;
  };
}

export type ArgoResourcesComponentArgs =
  utils.types.DeepPulumiInput<ArgoResourcesComponentArgsShape>;

export const ArgoResourcesComponent = utils.functions.defineComponent(
  'argoResources',
  (
    args: ArgoResourcesComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const appsDeployerAccountToken = new argocd.AccountToken(
      `${resourceName}-appsDeployerAccountToken`,
      {
        account: args.gitOpsProjects.apps.accountName,
        expiresIn: `${24 * 31}h`,
        renewBefore: '24h',
      },
      {
        ...opts,
        provider: args.providers.argocd,
      },
    );

    const toolsDeployerAccountToken = new argocd.AccountToken(
      `${resourceName}-toolsDeployerAccountToken`,
      {
        account: args.gitOpsProjects.tools.accountName,
        expiresIn: `${24 * 31}h`,
        renewBefore: '24h',
      },
      {
        ...opts,
        provider: args.providers.argocd,
      },
    );

    // Bridged TF provider: MaxItems:1 blocks become 1-element arrays (`metadatas`/`specs`).
    const inClusterDestination = {
      server: 'https://kubernetes.default.svc',
      namespace: '*',
    };

    const appsProject = new argocd.Project(
      `${resourceName}-appsProject`,
      {
        metadatas: [
          {
            name: args.gitOpsProjects.apps.name,
            namespace: args.namespace,
          },
        ],
        specs: [
          {
            description: 'Apps GitOps project',
            // Git clone URL (not repo name)
            sourceRepos: [args.gitOpsRepository.sshCloneUrl],
            destinations: [inClusterDestination],
          },
        ],
      },
      {
        ...opts,
        provider: args.providers.argocd,
        dependsOn: [appsDeployerAccountToken],
      },
    );

    const toolsProject = new argocd.Project(
      `${resourceName}-toolsProject`,
      {
        metadatas: [
          {
            name: args.gitOpsProjects.tools.name,
            namespace: args.namespace,
          },
        ],
        specs: [
          {
            description: 'Tools GitOps project',
            sourceRepos: [args.gitOpsRepository.sshCloneUrl],
            destinations: [inClusterDestination],
          },
        ],
      },
      {
        ...opts,
        provider: args.providers.argocd,
        dependsOn: [toolsDeployerAccountToken],
      },
    );

    const gitOpsRepository = new argocd.Repository(
      `${resourceName}-gitOpsRepository`,
      {
        name: args.gitOpsRepository.name,
        repo: args.gitOpsRepository.sshCloneUrl,
        sshPrivateKey: args.gitOpsRepository.deployPrivateKeyPem,
      },
      {
        ...opts,
        provider: args.providers.argocd,
      },
    );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
