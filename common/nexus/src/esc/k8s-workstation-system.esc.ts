import { z } from 'zod';
import { AbstractEsc } from '../abstract';

const k8sWorkstationSystemEscSchema = z
  .object({
    nodes: z
      .object({
        node0: z
          .object({
            hostName: z.string(),
          })
          .required(),
      })
      .required(),
    loadbalancer: z
      .object({
        metallb: z
          .object({
            ipRange: z.string(),
            ingressGatewayIp: z.string(),
            additionalPort: z.object({}).required(),
          })
          .required(),
      })
      .required(),
    authentik: z
      .object({
        secretKey: z.string(),
        bootstrap: z
          .object({
            token: z.string(),
            email: z.string(),
            password: z.string(),
          })
          .required(),
        postgresqlPassword: z.string(),
        redisPassword: z.string(),
        oauth: z
          .object({
            allowedEmails: z.array(z.string()),
            google: z
              .object({
                clientId: z.string(),
                clientSecret: z.string(),
              })
              .required(),
          })
          .required(),
      })
      .required(),
  })
  .required();

class K8sWorkstationSystemEsc extends AbstractEsc<
  typeof k8sWorkstationSystemEscSchema
> {
  constructor() {
    super('k8s-workstation-system', k8sWorkstationSystemEscSchema);
  }
}

export const k8sWorkstationSystemEsc = new K8sWorkstationSystemEsc();
