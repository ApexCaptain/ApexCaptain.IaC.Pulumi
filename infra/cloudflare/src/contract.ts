import fs from 'fs';
import path from 'path';

import * as nexus from '@common/nexus';
import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';
import yaml from 'yaml';

import * as components from './components';

export const cloudflareContract = new nexus.classes.Contract(
  yaml.parse(fs.readFileSync(path.join(__dirname, '../Pulumi.yaml'), 'utf8'))
    .name,
  async () => {
    // ESC
    const projectEsc = nexus.esc.cloudflareEsc;
    const commonEsc = nexus.esc.commonEsc;

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

    const recordsWorkstation =
      new components.records.RecordsWorkstationComponent('recordsWorkstation', {
        zoneId: apexCaptainCloudflareZone.id,
        workstationDomain: commonEsc.esc.workstationIptimeDomain,
        providers: {
          cloudflare: apexCaptainCloudflareProvider,
        },
      });

    return {
      output: pulumi.output({
        domains: recordsWorkstation.output.domains,
      }),
      secret: pulumi.secret({
        apexCaptainCloudflareApiToken: projectEsc.esc.apiToken,
        apexCaptainCloudflareEmail: projectEsc.esc.email,
      }),
    };
  },
);
