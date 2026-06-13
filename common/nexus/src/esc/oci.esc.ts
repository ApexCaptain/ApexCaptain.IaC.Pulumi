import { z } from 'zod';
import { AbstractEsc } from '../abstract';

const ociEscSchema = z
  .object({
    auth: z.enum([
      'ApiKey',
      'SecurityToken',
      'InstancePrincipal',
      'ResourcePrincipal',
      'OKEWorkloadIdentity',
    ]),
    fingerprint: z.string(),
    privateKey: z.string(),
    region: z.string(),
    tenancyOcid: z.string(),
    userOcid: z.string(),
  })
  .required();

class OciEsc extends AbstractEsc<typeof ociEscSchema> {
  constructor() {
    super('oci', ociEscSchema);
  }
}

export const ociEsc = new OciEsc();
