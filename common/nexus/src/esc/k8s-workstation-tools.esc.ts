import { z } from 'zod';
import { AbstractEsc } from '../abstract';

const k8sWorkstationToolsEscSchema = z
  .object({
    coder: z
      .object({
        githubApp: z.object({
          clientId: z.string(),
          clientSecret: z.string(),
        }),
        firstUser: z
          .object({
            email: z.email(),
            username: z.string(),
            fullName: z.string(),
            password: z.string(),
          })
          .required(),
      })
      .required(),
  })
  .required();

class K8sWorkstationToolsEsc extends AbstractEsc<
  typeof k8sWorkstationToolsEscSchema
> {
  constructor() {
    super('k8s-workstation-tools', k8sWorkstationToolsEscSchema);
  }
}

export const k8sWorkstationToolsEsc = new K8sWorkstationToolsEsc();
