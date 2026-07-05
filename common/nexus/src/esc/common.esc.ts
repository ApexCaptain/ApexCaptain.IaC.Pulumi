import z from 'zod';
import { AbstractEsc } from '../abstract';

const commonEscSchema = z
  .object({
    workstationKubeconfig: z.string(),
    workstationIptimeDomain: z.string(),
    workstationIpV4Address: z.string(),
    workstationPodsSubnetCidrBlock: z.string(),
    workstationServicesSubnetCidrBlock: z.string(),
    workstationLocalPathStorageClassName: z.string(),
    adapter: z
      .object({
        sftp: z
          .object({
            userName: z.string(),
          })
          .required(),
      })
      .required(),
    istioNetwork: z
      .object({
        meshId: z.string(),
        workstationClusterName: z.string(),
        workstationClusterNetwork: z.string(),
        workstationDirectGateway: z
          .object({
            jellyfinSftpName: z.string(),
            jellyfinSftpProtocol: z.string(),
            jellyfinSftpPort: z.number(),
            qbittorrentSftpName: z.string(),
            qbittorrentSftpProtocol: z.string(),
            qbittorrentSftpPort: z.number(),
          })
          .required(),
      })
      .required(),
    nordLynx: z
      .object({
        privateKey: z.string(),
      })
      .required(),

    helmRepositoryUrls: z
      .object({
        'jellyfin.github.io/jellyfin-helm': z.string(),
        'istio-release.storage.googleapis.com/charts': z.string(),
        'charts.jetstack.io': z.string(),
        'charts.goauthentik.io': z.string(),
        'helm.releases.hashicorp.com': z.string(),
        'charts.longhorn.io': z.string(),
        'go-vikunja/helm-chart/vikunja': z.string(),
        'cloudnative-pg.github.io/charts': z.string(),
        'stakater.github.io/stakater-charts': z.string(),
        'argoproj.github.io/argo-helm': z.string(),
      })
      .required(),
  })
  .required();

class CommonEsc extends AbstractEsc<typeof commonEscSchema> {
  constructor() {
    super('common', commonEscSchema);
  }
}

export const commonEsc = new CommonEsc();
