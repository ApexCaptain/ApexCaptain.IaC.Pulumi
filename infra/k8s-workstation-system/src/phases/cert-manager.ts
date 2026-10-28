import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import * as components from '../components';
import { SystemProviders } from './providers';

/** cert-manager + ClusterIssuer. Vault TLS·mesh ingress 인증서의 선행. */
export const deployCertManager = (deps: { providers: SystemProviders }) => {
  const commonEsc = nexus.esc.commonEsc;
  const { workstationK8sProvider } = deps.providers;

  const certManagerHelmChart =
    new components.certManager.CertManagerHelmChartComponent(
      'certManagerHelmChart',
      {
        helm: {
          certManager: {
            version: utils.configs.helmChartVersions.certManager,
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls['charts.jetstack.io'],
          },
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
    );

  const certManagerResources =
    new components.certManager.CertManagerResourcesComponent(
      'certManagerResources',
      {
        namespace: certManagerHelmChart.output.namespace,
        cloudflareApiToken:
          cloudflareContract.secret.apexCaptainCloudflareApiToken,
        cloudflareEmail: cloudflareContract.secret.apexCaptainCloudflareEmail,
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      { dependsOn: [certManagerHelmChart] },
    );

  return { certManagerHelmChart, certManagerResources };
};

export type CertManagerPhase = ReturnType<typeof deployCertManager>;
