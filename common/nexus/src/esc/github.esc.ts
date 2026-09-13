/**
 * GitHub ESC. ApexCaptain 계정·IaC/GitOps 레포 이름·Actions secret 값.
 * `@infra/github`이 소비하고, system은 token으로 deploy key·webhook만 붙인다.
 */
import z from 'zod';
import { AbstractEsc } from '../abstract';

const githubEscSchema = z
  .object({
    apexCaptain: z
      .object({
        owner: z.string(),
        token: z.string(),
        repositories: z
          .object({
            apexCaptainIacPulumi: z
              .object({
                name: z.string(),
              })
              .required(),
            apexCaptainIacGitOps: z
              .object({
                name: z.string(),
              })
              .required(),
          })
          .required(),
        actions: z
          .object({
            pulumiAccessToken: z.string(),
            workflowToken: z.string(),
          })
          .required(),
      })
      .required(),
  })
  .required();

class GithubEsc extends AbstractEsc<typeof githubEscSchema> {
  constructor() {
    super('github', githubEscSchema);
  }
}

export const githubEsc = new GithubEsc();
