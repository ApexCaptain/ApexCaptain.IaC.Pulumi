import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import yaml from 'yaml';
import { KubeConfig } from '../common/utils/src/interfaces/kubeconfig.interface';

const mergeKubeConfig = () => {
  const generatedKubeConfigs = fs
    .readdirSync(process.env.KUBE_CONFIG_DIR_NAME!!)
    .filter(eachKubeConfigfile => eachKubeConfigfile.endsWith('.yaml'))
    .map(eachKubeConfigfile => {
      const absolutePath = path.join(
        process.env.KUBE_CONFIG_DIR_NAME!!,
        eachKubeConfigfile,
      );
      return yaml.parse(fs.readFileSync(absolutePath, 'utf8')) as KubeConfig;
    });

  if (generatedKubeConfigs.length === 0) {
    console.warn('No kube config files found');
    return;
  }

  const mergedKubeConfig: KubeConfig = {
    apiVersion: 'v1',
    kind: 'Config',
    preferences: {},
    clusters: _.uniqBy(
      generatedKubeConfigs.flatMap(eachKubeConfig => eachKubeConfig.clusters),
      'name',
    ),
    contexts: _.uniqBy(
      generatedKubeConfigs.flatMap(eachKubeConfig => eachKubeConfig.contexts),
      'name',
    ),
    users: _.uniqBy(
      generatedKubeConfigs.flatMap(eachKubeConfig => eachKubeConfig.users),
      'name',
    ),
  };

  const targetKubeConfigFilePath = process.env.KUBECONFIG!!;
  const prevTargetKubeConfig: KubeConfig | undefined = fs.existsSync(
    targetKubeConfigFilePath,
  )
    ? (yaml.parse(
        fs.readFileSync(targetKubeConfigFilePath, 'utf8'),
      ) as KubeConfig)
    : undefined;

  const finalKubeConfig: KubeConfig = {
    ...prevTargetKubeConfig,
    ...mergedKubeConfig,
  };

  // Set default current contest
  if (!finalKubeConfig['current-context']) {
    finalKubeConfig['current-context'] = finalKubeConfig.contexts[0].name;
  } else {
    const currentContext = finalKubeConfig['current-context'];
    const availableContexts = finalKubeConfig.contexts.map(
      eachContext => eachContext.name,
    );
    if (!availableContexts.includes(currentContext)) {
      finalKubeConfig['current-context'] = availableContexts[0];
    }
  }

  fs.writeFileSync(targetKubeConfigFilePath, yaml.stringify(finalKubeConfig));
};
mergeKubeConfig();
