import * as nexus from '@common/nexus/src';
import * as utils from '@common/utils/src';
import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';

interface RecordsWorkstationComponentArgsShape {
  zoneId: string;
  workstationDomain: string;
  providers: {
    cloudflare: cloudflare.Provider;
  };
}

export type RecordsWorkstationComponentArgs =
  utils.types.DeepPulumiInput<RecordsWorkstationComponentArgsShape>;

export const RecordsWorkstationComponent = nexus.function.defineComponent(
  'recordsWorkstation',
  (
    args: RecordsWorkstationComponentArgs,
    opts: pulumi.ComponentResourceOptions,
  ) => {
    const jellyfinRecord = new cloudflare.DnsRecord(
      'jellyfinRecord',
      {
        name: 'jellyfin',
        ttl: 1,
        zoneId: args.zoneId,
        type: 'CNAME',
        content: args.workstationDomain,
        proxied: false,
        comment: 'Cloudflare DNS Record for Jellyfin Service',
      },
      {
        ...opts,
        provider: args.providers.cloudflare,
      },
    );

    return {
      output: pulumi.output({
        domains: {
          jellyfin: jellyfinRecord.name,
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
