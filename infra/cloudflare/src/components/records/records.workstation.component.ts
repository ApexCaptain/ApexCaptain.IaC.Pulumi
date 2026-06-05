import * as utils from '@common/utils/src';
import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';

interface RecordsWorkstationComponentArgsShape {
  zoneId: string;
  zoneDomain: string;
  workstationDomain: string;
  providers: {
    cloudflare: cloudflare.Provider;
  };
}

export type RecordsWorkstationComponentArgs =
  utils.types.DeepPulumiInput<RecordsWorkstationComponentArgsShape>;

export const RecordsWorkstationComponent = utils.functions.defineComponent(
  'recordsWorkstation',
  (
    args: RecordsWorkstationComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const directRecord = new cloudflare.DnsRecord(
      `${resourceName}-directRecord`,
      {
        name: 'workstation',
        ttl: 1,
        zoneId: args.zoneId,
        type: 'CNAME',
        content: args.workstationDomain,
        proxied: false,
        comment: 'Cloudflare DNS Direct Record for Workstation System',
      },
      {
        ...opts,
        provider: args.providers.cloudflare,
      },
    );

    const authRecord = new cloudflare.DnsRecord(
      `${resourceName}-authRecord`,
      {
        name: 'auth',
        ttl: 1,
        zoneId: args.zoneId,
        type: 'CNAME',
        content: args.workstationDomain,
        proxied: true,
        comment: 'Cloudflare DNS Record for Auth Service',
      },
      {
        ...opts,
        provider: args.providers.cloudflare,
      },
    );

    const jellyfinRecord = new cloudflare.DnsRecord(
      `${resourceName}-jellyfinRecord`,
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

    const torrentRecord = new cloudflare.DnsRecord(
      `${resourceName}-torrentRecord`,
      {
        name: 'torrent',
        ttl: 1,
        zoneId: args.zoneId,
        type: 'CNAME',
        content: args.workstationDomain,
        proxied: true,
        comment: 'Cloudflare DNS Record for Torrent Service',
      },
      {
        ...opts,
        provider: args.providers.cloudflare,
      },
    );

    return {
      output: pulumi.output({
        records: {
          workstation: pulumi.interpolate`${directRecord.name}.${args.zoneDomain}`,
          auth: pulumi.interpolate`${authRecord.name}.${args.zoneDomain}`,
          jellyfin: pulumi.interpolate`${jellyfinRecord.name}.${args.zoneDomain}`,
          torrent: pulumi.interpolate`${torrentRecord.name}.${args.zoneDomain}`,
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
