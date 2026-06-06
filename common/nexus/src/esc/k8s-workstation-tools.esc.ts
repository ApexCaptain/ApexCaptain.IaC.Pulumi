import { z } from 'zod';
import { AbstractEsc } from '../abstract';

const k8sWorkstationToolsEscSchema = z.object({}).required();

class K8sWorkstationToolsEsc extends AbstractEsc<
  typeof k8sWorkstationToolsEscSchema
> {
  constructor() {
    super('k8s-workstation-tools', k8sWorkstationToolsEscSchema);
  }
}

export const k8sWorkstationToolsEsc = new K8sWorkstationToolsEsc();
