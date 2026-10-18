import { z } from 'zod';
import { AbstractEsc } from '../abstract';

const cloudflareEscSchema = z
  .object({
    apiToken: z.string(),
    email: z.email(),
    zones: z
      .object({
        ayteneve93com: z
          .object({
            id: z.string(),
          })
          .required(),
        itemguessercom: z
          .object({
            id: z.string(),
          })
          .required(),
      })
      .required(),
    zeroTrust: z
      .object({
        allowedEmails: z.array(z.email()).min(1),
      })
      .required(),
  })
  .required();

class CloudflareEsc extends AbstractEsc<typeof cloudflareEscSchema> {
  constructor() {
    super('cloudflare', cloudflareEscSchema);
  }
}

export const cloudflareEsc = new CloudflareEsc();
