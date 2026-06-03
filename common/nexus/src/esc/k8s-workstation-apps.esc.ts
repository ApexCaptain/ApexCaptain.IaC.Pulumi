import { z } from 'zod';
import { AbstractEsc } from '../abstract';

const k8sWorkstationAppsEscSchema = z.object({}).required();

class K8sWorkstationAppsEsc extends AbstractEsc<
  typeof k8sWorkstationAppsEscSchema
> {
  constructor() {
    super('k8s-workstation-apps', k8sWorkstationAppsEscSchema);
  }
}

export const k8sWorkstationAppsEsc = new K8sWorkstationAppsEsc();
