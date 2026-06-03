import * as nexus from '@common/nexus';
import { k8sWorkstationSystemContract } from '@infra/k8s-workstation-system/src/contract';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

export const k8sWorkstationToolsContract = new nexus.classes.Contract(
  __filename,
  async () => {
    /*
    // K8s Provider
    const workstationK8sProvider = new kubernetes.Provider(
      'workstationK8sProvider',
      {
        kubeconfig: k8sWorkstationSystemContract.output.kubeConfigFilePath,
      },
    );
    */

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
