import { authentik } from '@common/bridged-provider';
import * as nexus from '@common/nexus';
import { k8sWorkstationSystemContract } from '@infra/k8s-workstation-system/src/contract';
import * as kubernetes from '@pulumi/kubernetes';
import * as vault from '@pulumi/vault';

export const deployProviders = () => {
  const commonEsc = nexus.esc.commonEsc;

  const workstationK8sProvider = new kubernetes.Provider(
    'workstationK8sProvider',
    {
      kubeconfig: commonEsc.esc.workstationKubeconfig,
    },
  );

  const authentikProvider = new authentik.Provider(
    'authentikProvider',
    k8sWorkstationSystemContract.secret.providerConfigs.authentik,
  );
  const vaultProvider = new vault.Provider(
    'vaultProvider',
    k8sWorkstationSystemContract.secret.providerConfigs.vault,
  );

  return { workstationK8sProvider, authentikProvider, vaultProvider };
};

export type ToolsProviders = ReturnType<typeof deployProviders>;
