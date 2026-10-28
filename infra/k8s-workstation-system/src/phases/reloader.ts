import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import * as components from '../components';
import { SystemProviders } from './providers';

/** Reloader — ConfigMap·Secret 변경 시 annotation 걸린 워크로드 재시작. */
export const deployReloader = (deps: { providers: SystemProviders }) => {
  const commonEsc = nexus.esc.commonEsc;
  const { workstationK8sProvider } = deps.providers;

  new components.reloader.ReloaderHelmChartComponent('reloaderHelmChart', {
    helm: {
      reloader: {
        version: utils.configs.helmChartVersions.reloader,
        repositoryUrl:
          commonEsc.esc.helmRepositoryUrls['stakater.github.io/stakater-charts'],
      },
    },
    providers: {
      kubernetes: workstationK8sProvider,
    },
  });
};
