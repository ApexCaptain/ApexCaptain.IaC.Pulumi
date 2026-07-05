import * as utils from '@common/utils/src';
import * as github from '@pulumi/github';
import * as pulumi from '@pulumi/pulumi';

interface ArgoGitOpsComponentArgsShape {
  gitOpsRepositoryName: string;
  providers: {
    github: github.Provider;
  };
}

export type ArgoGitOpsComponentArgs =
  utils.types.DeepPulumiInput<ArgoGitOpsComponentArgsShape>;

export const ArgoGitOpsComponent = utils.functions.defineComponent(
  'argoGitOps',
  (
    args: ArgoGitOpsComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const gitOpsRepository = pulumi
      .output(args.gitOpsRepositoryName)
      .apply(async resolvedGitOpsRepositoryName => {
        return github.getRepository({
          name: resolvedGitOpsRepositoryName,
        });
      });

    pulumi.output(gitOpsRepository).apply(resolved => {
      console.log(resolved);
    });

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
