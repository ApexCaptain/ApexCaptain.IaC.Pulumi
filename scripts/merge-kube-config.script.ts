import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import yaml from 'yaml';
import { KubeConfig } from '../common/utils/src/interfaces/kubeconfig.interface';

/**
 * .kube 디렉터리 내에 개별적으로 생성된 모든 KubeConfig YAML 파일들을 읽어
 * clusters, contexts, users를 이름 기준으로 중복 제거하여 하나의 통합 KubeConfig 파일로 병합합니다.
 */
const mergeKubeConfig = (): void => {
  const kubeConfigDir = process.env.KUBE_CONFIG_DIR_NAME;
  if (!kubeConfigDir || !fs.existsSync(kubeConfigDir)) {
    console.warn(`KubeConfig 디렉터리가 존재하지 않습니다: ${kubeConfigDir}`);
    return;
  }

  // 1. 디렉터리 내의 모든 .yaml 파일을 읽어 KubeConfig 객체 배열로 변환
  const generatedKubeConfigs = fs
    .readdirSync(kubeConfigDir)
    .filter(eachKubeConfigfile => eachKubeConfigfile.endsWith('.yaml'))
    .map(eachKubeConfigfile => {
      const absolutePath = path.join(kubeConfigDir, eachKubeConfigfile);
      return yaml.parse(fs.readFileSync(absolutePath, 'utf8')) as KubeConfig;
    });

  if (generatedKubeConfigs.length === 0) {
    console.warn('병합할 KubeConfig 파일이 없습니다.');
    return;
  }

  // 2. clusters, contexts, users를 각각 'name' 기준으로 고유하게 병합
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

  // 3. 기존의 대상 KUBECONFIG 파일이 존재할 경우 기존 내용도 함께 병합
  const targetKubeConfigFilePath = process.env.KUBECONFIG;
  if (!targetKubeConfigFilePath) {
    console.warn('KUBECONFIG 환경변수가 설정되어 있지 않습니다.');
    return;
  }

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

  // 4. 유효한 current-context 설정 (누락되었거나 목록에 없는 경우 첫 번째 컨텍스트로 지정)
  if (!finalKubeConfig['current-context']) {
    finalKubeConfig['current-context'] = finalKubeConfig.contexts[0]?.name;
  } else {
    const currentContext = finalKubeConfig['current-context'];
    const availableContexts = finalKubeConfig.contexts.map(
      eachContext => eachContext.name,
    );
    if (!availableContexts.includes(currentContext)) {
      finalKubeConfig['current-context'] = availableContexts[0];
    }
  }

  // 5. 최종 KubeConfig 파일 기록
  fs.mkdirSync(path.dirname(targetKubeConfigFilePath), { recursive: true });
  fs.writeFileSync(targetKubeConfigFilePath, yaml.stringify(finalKubeConfig));
};

mergeKubeConfig();
