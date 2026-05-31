import { z } from 'zod';
import { AbstractEsc } from '../abstract';

const k8sWorkstationSystemEscSchema = z
  .object({
    kubeConfig: z
      .object({
        certificateAuthorityData: z.string(),
        clientCertificateData: z.string(),
        clientKeyData: z.string(),
        server: z.url(),
        fileDirPath: z.string(),
      })
      .required(),
    loadbalancer: z
      .object({
        metallb: z
          .object({
            ipRange: z.string(),
            ingressGatewayIp: z.string(),
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
