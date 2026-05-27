import * as nexus from '@common/nexus';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

export const k8sWorkstationSystemContract = new nexus.classes.Contract(
  'k8s-workstation-system',
  async () => {
    const projectEsc = nexus.esc.k8sWorkstationSystemEsc;

    const kubeConfig = new nexus.components.KubeConfigComponent('kubeConfig', {
      name: 'ws',
      fileDirPath: projectEsc.esc.kubeConfig.fileDirPath,
      clustser: {
        certificateAuthorityData:
          projectEsc.esc.kubeConfig.certificateAuthorityData,
        server: projectEsc.esc.kubeConfig.server,
      },
      user: {
        clientCertificateData: projectEsc.esc.kubeConfig.clientCertificateData,
        clientKeyData: projectEsc.esc.kubeConfig.clientKeyData,
      },
    });

    const workstationK8sProvider = new kubernetes.Provider(
      'workstationK8sProvider',
      {
        kubeconfig: kubeConfig.output.kubeConfigFilePath,
      },
    );

    return {
      output: pulumi.output({
        kubeConfigFilePath: kubeConfig.output.kubeConfigFilePath,
      }),
      secret: pulumi.secret({}),
    };
  },
);
