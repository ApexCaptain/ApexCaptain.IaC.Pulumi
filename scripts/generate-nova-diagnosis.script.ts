import { execSync } from 'child_process';
import fs, { readFileSync } from 'fs';
import path from 'path';
import axios from 'axios';
import dedent from 'dedent';
import json2md from 'json2md';
import _ from 'lodash';
import semver from 'semver';
import yaml from 'yaml';
import { KubeConfig } from '../common/utils/src/interfaces/kubeconfig.interface';

/**
 * Fairwinds Nova CLI JSON 출력 결과 타입 정의
 */
type NovaDiagnosisResult = {
  helm: {
    release: string;
    chartName: string;
    namespace: string;
    description: string;
    home: string;
    icon: string;
    Installed: {
      version: string;
      appVersion: string;
      kubeVersion: string;
    };
    Latest: {
      version: string;
      appVersion: string;
      kubeVersion: string;
    };
    outdated: boolean;
    deprecated: boolean;
    helmVersion: string;
    overridden: boolean;
  }[];
  container: {
    container_images: {
      name: string;
      current_version: string;
      latest_version: string;
      latest_minor_version: string;
      latest_patch_version: string;
      outdated: boolean;
      affectedWorkloads: {
        name: string;
        namespace: string;
        kind: string;
        container: string;
      }[];
    }[];
  };
};

/**
 * 로컬 시스템에 설치된 Nova CLI 버전을 확인합니다.
 */
const getLocalNovaVersion = (): string => {
  const localVersion = execSync('nova version')
    .toString()
    .match(/Version:([0-9.]+)/)?.[1];

  if (!localVersion) {
    throw new Error('로컬 Nova CLI 버전을 확인할 수 없습니다.');
  }

  return localVersion;
};

/**
 * GitHub Releases API를 조회하여 최신 Nova CLI 배포 버전을 가져옵니다.
 */
const getRemoteNovaVersion = async (): Promise<string> => {
  const response = await axios.get(
    'https://api.github.com/repos/fairwindsops/nova/releases/latest',
    {
      headers: {
        'User-Agent': 'axios-version-checker',
      },
    },
  );
  if (!response.data.tag_name) {
    throw new Error('원격 Nova 최신 릴리스 버전을 가져올 수 없습니다.');
  }
  return response.data.tag_name.replace('v', '');
};

const formatBoolean = (value: boolean): string => (value ? 'Yes' : 'No');

/**
 * 특정 Kubernetes Context에 대한 Nova 진단 결과를 바탕으로
 * Helm Release 및 Container Image 상태를 나타내는 Markdown 데이터 구조를 생성합니다.
 */
const buildNovaDiagnosisMarkdownDocuments = (
  contextName: string,
  novaDiagnosisResult: NovaDiagnosisResult,
): json2md.DataObject[] => {
  const documents: json2md.DataObject[] = [
    { h2: `Context: \`\`\`${contextName}\`\`\`` },
  ];

  // 1. 조치가 필요한 Helm Release (Outdated 또는 Deprecated) 필터링
  const actionableHelmReleases = novaDiagnosisResult.helm.filter(
    eachHelmRelease => eachHelmRelease.outdated || eachHelmRelease.deprecated,
  );
  const deprecatedOnlyHelmReleases = actionableHelmReleases.filter(
    eachHelmRelease => eachHelmRelease.deprecated && !eachHelmRelease.outdated,
  );

  if (actionableHelmReleases.length === 0) {
    documents.push({
      h3: 'Outdated or Deprecated Helm Releases',
      p: 'No outdated or deprecated Helm releases found.',
    });
  } else {
    documents.push(
      { h3: 'Outdated or Deprecated Helm Releases' },
      {
        table: {
          headers: [
            'Release',
            'Chart',
            'Namespace',
            'Installed Version',
            'Latest Version',
            'Outdated',
            'Deprecated',
          ],
          rows: actionableHelmReleases.map(eachHelmRelease => [
            eachHelmRelease.release,
            eachHelmRelease.chartName,
            eachHelmRelease.namespace,
            `${eachHelmRelease.Installed.version} (app: ${eachHelmRelease.Installed.appVersion})`,
            `${eachHelmRelease.Latest.version} (app: ${eachHelmRelease.Latest.appVersion})`,
            formatBoolean(eachHelmRelease.outdated),
            formatBoolean(eachHelmRelease.deprecated),
          ]),
        },
      },
    );

    // Deprecated 전용 차트 별도 표기
    if (deprecatedOnlyHelmReleases.length > 0) {
      documents.push(
        { h4: 'Deprecated Only' },
        {
          table: {
            headers: [
              'Release',
              'Chart',
              'Namespace',
              'Installed Version',
              'Latest Version',
            ],
            rows: deprecatedOnlyHelmReleases.map(eachHelmRelease => [
              eachHelmRelease.release,
              eachHelmRelease.chartName,
              eachHelmRelease.namespace,
              `${eachHelmRelease.Installed.version} (app: ${eachHelmRelease.Installed.appVersion})`,
              `${eachHelmRelease.Latest.version} (app: ${eachHelmRelease.Latest.appVersion})`,
            ]),
          },
        },
      );
    }
  }

  // 2. 최신 버전이 아닌 Outdated 컨테이너 이미지 필터링
  const outdatedContainerImages =
    novaDiagnosisResult.container.container_images.filter(
      eachContainerImage => eachContainerImage.outdated,
    );

  if (outdatedContainerImages.length === 0) {
    documents.push({
      h3: 'Outdated Container Images',
      p: 'No outdated container images found.',
    });
  } else {
    documents.push(
      { h3: 'Outdated Container Images' },
      {
        table: {
          headers: [
            'Image',
            'Current Version',
            'Latest Version',
            'Latest Minor',
            'Latest Patch',
          ],
          rows: outdatedContainerImages.map(eachContainerImage => [
            eachContainerImage.name,
            eachContainerImage.current_version,
            eachContainerImage.latest_version,
            eachContainerImage.latest_minor_version,
            eachContainerImage.latest_patch_version,
          ]),
        },
      },
    );
  }

  return documents;
};

/**
 * 모든 Kubernetes Context를 순회하며 Nova 진단을 실행하고 통합 Markdown 리포트를 생성합니다.
 */
const generateNovaDiagnosis = async (): Promise<void> => {
  const markdownDocuments: json2md.DataObject[] = [
    {
      h1: 'Nova Diagnosis Report',
      p: `Generated at \`\`\`${new Date().toISOString()}\`\`\``,
    },
  ];

  // 1. Nova CLI 버전 최신성 검사
  const localVersion = getLocalNovaVersion();
  const remoteVersion = await getRemoteNovaVersion();
  if (semver.gt(remoteVersion, localVersion)) {
    markdownDocuments.push({
      h2: 'Nova CLI Version Mismatch',
      p: [
        `Remote version \`\`\`${remoteVersion}\`\`\` is greater than local version \`\`\`${localVersion}\`\`\``,
        'Please update your Nova CLI to the latest version.',
      ],
    });
  }

  // 2. Kubeconfig의 각 Context별 Nova 검사 실행
  const kubeConfigFile = process.env.KUBECONFIG;
  if (!kubeConfigFile || !fs.existsSync(kubeConfigFile)) {
    console.warn(`KUBECONFIG 파일을 찾을 수 없습니다: ${kubeConfigFile}`);
    return;
  }

  const kubeConfig = yaml.parse(
    readFileSync(kubeConfigFile).toString(),
  ) as KubeConfig;
  const contextNames = kubeConfig.contexts.map(eachContext => eachContext.name);

  contextNames.forEach(eachContextName => {
    const novaDiagnosisResult: NovaDiagnosisResult = JSON.parse(
      execSync(dedent`
        nova find \
          --config ${process.env.NOVA_CONFIG_FILE_PATH} \
          --helm \
          --containers \
          --context ${eachContextName} \
          --format json \
          --show-old
      `).toString(),
    );
    markdownDocuments.push(
      ...buildNovaDiagnosisMarkdownDocuments(
        eachContextName,
        novaDiagnosisResult,
      ),
    );
  });

  // 3. 마크다운 파일로 저장
  const result = json2md(markdownDocuments);
  const resultFilePath = process.env.DIAGNOSIS_NOVA_FILE_PATH!;
  const resultDirPath = path.dirname(resultFilePath);
  if (!fs.existsSync(resultDirPath)) {
    fs.mkdirSync(resultDirPath, { recursive: true });
  }
  fs.writeFileSync(resultFilePath, result);
};

void generateNovaDiagnosis();
