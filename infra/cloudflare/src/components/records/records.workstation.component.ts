import * as nexus from '@common/nexus/src';
import * as utils from '@common/utils/src';
import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';

interface RecordsWorkstationComponentArgsShape {
  zoneId: string;
  cloudflareProvider: cloudflare.Provider;
  workstationDomain: string;
}

export type RecordsWorkstationComponentArgs =
  utils.types.DeepPulumiInput<RecordsWorkstationComponentArgsShape>;

export const RecordsWorkstationComponent = nexus.function.defineComponent(
  'recordsWorkstation',
  (
    args: RecordsWorkstationComponentArgs,
    opts: pulumi.ComponentResourceOptions,
  ) => {
    const authentikRecord = new cloudflare.DnsRecord(
      'authentikRecord',
      {
        name: 'authentik',
        ttl: 1,
        zoneId: args.zoneId,
        type: 'CNAME',
        content: args.workstationDomain,
        proxied: true,
        comment: 'Cloudflare DNS Record for Authentik Service',
      },
      {
        provider: args.cloudflareProvider,
      },
    );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
