import { argocd, authentik } from '@common/bridged-provider';
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
      readerGroupName: string;
    };
    tools: {
      name: string;
      accountName: string;
      readerGroupName: string;
    };
  };
  providers: {
    argocd: argocd.Provider;
    authentik: authentik.Provider;
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
    const appsReaderGroup = new authentik.Group(
      `${resourceName}-appsReaderGroup`,
      {
        name: args.gitOpsProjects.apps.readerGroupName,
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    const toolsReaderGroup = new authentik.Group(
      `${resourceName}-toolsReaderGroup`,
      {
        name: args.gitOpsProjects.tools.readerGroupName,
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

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
        dependsOn: [appsReaderGroup],
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
        dependsOn: [toolsReaderGroup],
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
        repo: args.gitOpsRepository.sshCloneUrl,
        sshPrivateKey: args.gitOpsRepository.deployPrivateKeyPem,
      },
      {
        ...opts,
        provider: args.providers.argocd,
        dependsOn: [appsProject, toolsProject],
      },
    );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
