import z from 'zod';
import { AbstractEsc } from '../abstract';

const commonEscSchema = z
  .object({
    workstationIptimeDomain: z.string(),
    workstationIpV4Address: z.string(),
    istioNetwork: z
      .object({
        meshId: z.string(),
        workstationClusterName: z.string(),
        workstationClusterNetwork: z.string(),
        workstationDefaultCalcioIpv4IpPoolsCidrBlock: z.string(),
      })
      .required(),
    nordLynx: z
      .object({
        privateKey: z.string(),
      })
      .required(),
  })
  .required();

class CommonEsc extends AbstractEsc<typeof commonEscSchema> {
  constructor() {
    super('common', commonEscSchema);
  }
}

export const commonEsc = new CommonEsc();
