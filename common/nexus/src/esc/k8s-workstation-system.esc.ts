import { z } from 'zod';
import { AbstractEsc } from '../abstract';

const k8sWorkstationSystemEscSchema = z
  .object({
    longhorn: z
      .object({
        nodes: z.array(
          z.object({
            hostName: z.string(),
            disks: z.array(
              z
                .object({
                  name: z.string(),
                  path: z.string(),
                  tags: z.array(z.string()),
                })
                .required(),
            ),
          }),
        ),
      })
      .required(),

    loadbalancer: z
      .object({
        celium: z
          .object({
            istioCrossNetworkTlsIp: z.string(),
            ingressGatewayIp: z.string(),
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
