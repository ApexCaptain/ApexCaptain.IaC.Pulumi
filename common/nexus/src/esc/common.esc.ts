import z from 'zod';
import { AbstractEsc } from '../abstract';

const commonEscSchema = z
  .object({
    workstationIptimeDomain: z.string(),
    workstationIpV4Address: z.string(),
    istioNetwork: z
      .object({
        meshId: z.string(),
        workstationClusterName: z.string(),
        workstationClusterNetwork: z.string(),
        workstationDefaultCalcioIpv4IpPoolsCidrBlock: z.string(),
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
        'metallb.github.io/metallb': z.string(),
        'kubernetes-sigs.github.io/metrics-server': z.string(),
        'charts.jetstack.io': z.string(),
        'charts.goauthentik.io': z.string(),
        'kubernetes-sigs.github.io/nfs-subdir-external-provisioner': z.string(),
        'helm.releases.hashicorp.com': z.string(),
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
