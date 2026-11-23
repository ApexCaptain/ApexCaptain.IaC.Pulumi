/**
 * Cloudflare DNS — workstation / itemguesser 도메인
 *
 * - `ayteneve93.com`: 기존 workstation 서비스 CNAME
 * - `itemguesser.com`: 공개 HTTPS 경로·앱용 (현재 test POC)
 *
 * 모든 레코드는 DNS only(`proxied: false`). 한국 트래픽이 Cloudflare 해외 엣지(SEA·LAX 등)로
 * 빠져 지연이 커짐 — docs/issues/resolved/2026-11-23-cloudflare-proxy-disable.md
 */
import * as nexus from '@common/nexus';
import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';
import * as components from './components';

export const cloudflareContract = new nexus.classes.Contract(
  __filename,
  async () => {
    // ESC
    const projectEsc = nexus.esc.cloudflareEsc;
    const commonEsc = nexus.esc.commonEsc;
    const githubEsc = nexus.esc.githubEsc;

    const apexCaptainCloudflareProvider = new cloudflare.Provider(
      'apexCaptainCloudflareProvider',
      {
        apiToken: projectEsc.esc.apiToken,
        email: projectEsc.esc.email,
      },
    );

    const apexCaptainCloudflareZone = cloudflare.getZoneOutput(
      {
        zoneId: projectEsc.esc.zones.ayteneve93com.id,
      },
      {
        provider: apexCaptainCloudflareProvider,
      },
    );

    const itemguesserCloudflareZone = cloudflare.getZoneOutput(
      {
        zoneId: projectEsc.esc.zones.itemguessercom.id,
      },
      {
        provider: apexCaptainCloudflareProvider,
      },
    );

    // ayteneve93com
    const ayteneve93comRecords =
      new components.ayteneve93com.Ayteneve93comRecordsComponent(
        'ayteneve93comRecords',
        {
          zoneId: apexCaptainCloudflareZone.id,
          zoneDomain: apexCaptainCloudflareZone.name,
          workstationDomain: commonEsc.esc.workstationIptimeDomain,
          apexCaptainGithubOwner: githubEsc.esc.apexCaptain.owner,
          providers: {
            cloudflare: apexCaptainCloudflareProvider,
          },
        },
      );

    // itemguessercom
    const itemguessercomRecords =
      new components.itemguessercom.ItemguessercomRecordsComponent(
        'itemguessercomRecords',
        {
          zoneId: itemguesserCloudflareZone.id,
          zoneDomain: itemguesserCloudflareZone.name,
          workstationDomain: commonEsc.esc.workstationIptimeDomain,
          providers: {
            cloudflare: apexCaptainCloudflareProvider,
          },
        },
      );

    return {
      output: pulumi.output({
        zones: {
          ayteneve93com: {
            domain: apexCaptainCloudflareZone.name,
            records: ayteneve93comRecords.output.records,
          },
          itemguessercom: {
            domain: itemguesserCloudflareZone.name,
            records: itemguessercomRecords.output.records,
          },
        },
      }),
      secret: pulumi.secret({
        apexCaptainCloudflareApiToken: projectEsc.esc.apiToken,
        apexCaptainCloudflareEmail: projectEsc.esc.email,
      }),
    };
  },
);
