/**
 * Workstation DNS 레코드
 *
 * 공통: `workstation` CNAME → iptime DDNS (proxied **false**, LE DNS-01·직접 접속용)
 *
 * | 호스트   | proxied | 이유 |
 * |----------|---------|------|
 * | auth     | true    | Authentik UI — CF WAF·캐시 앞단 |
 * | longhorn | true    | UI 보호 + 동일 |
 * | torrent  | true    | qBittorrent Web UI |
 * | vault    | true    | 공개 Vault API/UI |
 * | jellyfin | false   | 스트리밍·대역폭 — CF proxy 우회 |
 */
import * as utils from '@common/utils/src';
import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';

interface RecordsWorkstationComponentArgsShape {
  zoneId: string;
  zoneDomain: string;
  workstationDomain: string;
  apexCaptainGithubOwner: string;
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
    // iptime DDNS — cert-manager DNS-01·직접 L4(SFTP 등)의 공통 타깃
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

    const longhornRecord = new cloudflare.DnsRecord(
      `${resourceName}-longhornRecord`,
      {
        name: 'longhorn',
        ttl: 1,
        zoneId: args.zoneId,
        type: 'CNAME',
        content: args.workstationDomain,
        proxied: true,
        comment: 'Cloudflare DNS Record for Longhorn Service',
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

    const testRecord = new cloudflare.DnsRecord(
      `${resourceName}-testRecord`,
      {
        name: 'test',
        ttl: 1,
        zoneId: args.zoneId,
        type: 'CNAME',
        content: args.workstationDomain,
        proxied: true,
        comment: 'Cloudflare DNS Record for Test Service',
      },
      {
        ...opts,
        provider: args.providers.cloudflare,
      },
    );

    const vaultRecord = new cloudflare.DnsRecord(
      `${resourceName}-vaultRecord`,
      {
        name: 'vault',
        ttl: 1,
        zoneId: args.zoneId,
        type: 'CNAME',
        content: args.workstationDomain,
        proxied: true,
        comment: 'Cloudflare DNS Record for Vault Service',
      },
      {
        ...opts,
        provider: args.providers.cloudflare,
      },
    );

    const todoRecord = new cloudflare.DnsRecord(
      `${resourceName}-todoRecord`,
      {
        name: 'todo',
        ttl: 1,
        zoneId: args.zoneId,
        type: 'CNAME',
        content: args.workstationDomain,
        proxied: true,
        comment: 'Cloudflare DNS Record for Todo Service',
      },
      {
        ...opts,
        provider: args.providers.cloudflare,
      },
    );

    const argoCdRecord = new cloudflare.DnsRecord(
      `${resourceName}-argoCdRecord`,
      {
        name: 'argo-cd',
        ttl: 1,
        zoneId: args.zoneId,
        type: 'CNAME',
        content: args.workstationDomain,
        proxied: true,
        comment: 'Cloudflare DNS Record for Argo CD Service',
      },
      {
        ...opts,
        provider: args.providers.cloudflare,
      },
    );

    const argoWorkflowsRecord = new cloudflare.DnsRecord(
      `${resourceName}-argoWorkflowsRecord`,
      {
        name: 'argo-workflows',
        ttl: 1,
        zoneId: args.zoneId,
        type: 'CNAME',
        content: args.workstationDomain,
        proxied: true,
        comment: 'Cloudflare DNS Record for Argo Workflows Service',
      },
      {
        ...opts,
        provider: args.providers.cloudflare,
      },
    );

    // @TODO 임시로 넣어둠, 나중에 블로그 마이그레이션 하게 되면 수정해야 함
    const blogRecord = new cloudflare.DnsRecord(
      `${resourceName}-blogRecord`,
      {
        name: 'blog',
        ttl: 1,
        zoneId: args.zoneId,
        type: 'CNAME',
        // content: pulumi.interpolate`${args.apexCaptainGithubOwner}.github.io`,
        content: pulumi
          .output(args.apexCaptainGithubOwner)
          .apply(resolvedApexCaptainGithubOwner => {
            return `${resolvedApexCaptainGithubOwner.toLowerCase()}.github.io`;
          }),
        proxied: true,
        comment: 'Cloudflare DNS Record for Blog Service',
      },
      {
        ...opts,
        provider: args.providers.cloudflare,
      },
    );

    return {
      output: pulumi.output({
        records: {
          workstation: utils.functions.toCloudflareRecordFqdn(
            directRecord.name,
            args.zoneDomain,
          ),
          auth: utils.functions.toCloudflareRecordFqdn(
            authRecord.name,
            args.zoneDomain,
          ),
          jellyfin: utils.functions.toCloudflareRecordFqdn(
            jellyfinRecord.name,
            args.zoneDomain,
          ),
          longhorn: utils.functions.toCloudflareRecordFqdn(
            longhornRecord.name,
            args.zoneDomain,
          ),
          torrent: utils.functions.toCloudflareRecordFqdn(
            torrentRecord.name,
            args.zoneDomain,
          ),
          test: utils.functions.toCloudflareRecordFqdn(
            testRecord.name,
            args.zoneDomain,
          ),
          vault: utils.functions.toCloudflareRecordFqdn(
            vaultRecord.name,
            args.zoneDomain,
          ),
          todo: utils.functions.toCloudflareRecordFqdn(
            todoRecord.name,
            args.zoneDomain,
          ),
          argoCd: utils.functions.toCloudflareRecordFqdn(
            argoCdRecord.name,
            args.zoneDomain,
          ),
          argoWorkflows: utils.functions.toCloudflareRecordFqdn(
            argoWorkflowsRecord.name,
            args.zoneDomain,
          ),
          blog: utils.functions.toCloudflareRecordFqdn(
            blogRecord.name,
            args.zoneDomain,
          ),
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
