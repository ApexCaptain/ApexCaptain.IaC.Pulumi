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
    kubeConfig: z
      .object({
        certificateAuthorityData: z.string(),
        clientCertificateData: z.string(),
        clientKeyData: z.string(),
        server: z.url(),
      })
      .required(),
    loadbalancer: z
      .object({
        metallb: z
          .object({
            ipRange: z.string(),
            ingressGatewayIp: z.string(),
            additionalPort: z
              .object({
                nfsSftp: z.number(),
              })
              .required(),
          })
          .required(),
      })
      .required(),
    nfs: z
      .object({
        localPathHdd0: z.string(),
        localPathSsd0: z.string(),

        diskSizeHdd0: z.string(),
        diskSizeSsd0: z.string(),

        sftp: z
          .object({
            userName: z.string(),
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
