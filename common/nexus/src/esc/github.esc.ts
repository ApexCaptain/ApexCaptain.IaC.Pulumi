import z from 'zod';
import { AbstractEsc } from '../abstract';

const githubEscSchema = z
  .object({
    apexCaptain: z
      .object({
        owner: z.string(),
        token: z.string(),
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
