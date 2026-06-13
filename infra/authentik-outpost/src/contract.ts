import { authentik } from '@common/bridged-provider';
import * as nexus from '@common/nexus';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import { k8sWorkstationAppsContract } from '@infra/k8s-workstation-apps/src/contract';
import { k8sWorkstationSystemContract } from '@infra/k8s-workstation-system/src/contract';
import { k8sWorkstationToolsContract } from '@infra/k8s-workstation-tools/src/contract';
import * as pulumi from '@pulumi/pulumi';
import * as components from './components';

export const authentikOutpostContract = new nexus.classes.Contract(
  __filename,
  async () => {
    // Authentik Provider
    // const authentikProvider = new authentik.Provider(
    //   'authentikProvider',
    //   k8sWorkstationSystemContract.secret.providerConfigs.authentik,
    // );

    // Proxy Outpost
    /*
    const proxyOutpost = new components.proxyOutpost.ProxyOutpostComponent(
      'proxyOutpost',
      {
        host: cloudflareContract.output.zones.ayteneve93com.records.auth,
        outpostName:
          k8sWorkstationSystemContract.output.authentik
            .authentikProxyOutpostName,
        serviceConnectionId:
          k8sWorkstationSystemContract.output.authentik.serviceConnections
            .localKubernetesClusterId,
        providerIds: [
          k8sWorkstationToolsContract.output.authentik
            .qbittorrentAuthentikProxyProviderId,
        ],
        providers: {
          authentik: authentikProvider,
        },
      },
    );
    */

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
