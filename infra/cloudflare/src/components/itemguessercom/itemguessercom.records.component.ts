/**
 * `itemguesser.com` zone DNS — 공개 HTTPS POC·이후 앱 레코드용.
 *
 * 현재는 `test` CNAME만. 앱 추가 시 이 컴포넌트에 레코드를 늘리고 output에 키를 붙인다.
 */
import * as utils from '@common/utils/src';
import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';

interface ItemguessercomRecordsComponentArgsShape {
  zoneId: string;
  zoneDomain: string;
  workstationDomain: string;
  providers: {
    cloudflare: cloudflare.Provider;
  };
}

export type ItemguessercomRecordsComponentArgs =
  utils.types.DeepPulumiInput<ItemguessercomRecordsComponentArgsShape>;

export const ItemguessercomRecordsComponent = utils.functions.defineComponent(
  'itemguessercomRecords',
  (
    args: ItemguessercomRecordsComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const testRecord = new cloudflare.DnsRecord(
      `${resourceName}-testRecord`,
      {
        name: 'test',
        ttl: 1,
        zoneId: args.zoneId,
        type: 'CNAME',
        content: args.workstationDomain,
        proxied: false,
        comment: 'Cloudflare DNS Record for itemguesser.com HTTPS POC',
      },
      {
        ...opts,
        provider: args.providers.cloudflare,
      },
    );

    return {
      output: pulumi.output({
        records: {
          test: utils.functions.toCloudflareRecordFqdn(
            testRecord.name,
            args.zoneDomain,
          ),
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
