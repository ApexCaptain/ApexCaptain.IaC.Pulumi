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
        /** `<teamName>.cloudflareaccess.com` */
        teamName: z.string(),
        allowedEmails: z.array(z.email()).min(1),
        /** WARP 리졸버 대신 기기 원래 DNS(또는 dnsServers)로 보낼 suffix — `*.`·앞뒤 `.`는 제거 */
        localDomainFallbacks: z.array(
          z.object({
            suffix: z
              .string()
              .trim()
              .toLowerCase()
              .transform(suffix => suffix.replace(/^\*?\.+|\.+$/g, ''))
              .pipe(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/)),
            description: z.string().optional(),
            dnsServers: z.array(z.ipv4()).optional(),
          }),
        ),
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
