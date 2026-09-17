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
    slackWebhookUrlVaultInfraWarning: z.string().min(1),
    pcloudBackup: z
      .object({
        hostname: z.string().min(1),
        token: z.string().min(1),
        cryptPassword: z.string().min(1),
        cryptPassword2: z.string().min(1),
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
