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

const getLocalNovaVersion = () => {
  const localVersion = execSync('nova version')
    .toString()
    .match(/Version:([0-9.]+)/)?.[1];

  if (!localVersion) {
    throw new Error('Could not find local Nova version');
  }

  return localVersion;
};

const getRemoteNovaVersion = async () => {
  const response = await axios.get(
    'https://api.github.com/repos/fairwindsops/nova/releases/latest',
    {
      headers: {
        'User-Agent': 'axios-version-checker',
      },
    },
  );
  if (!response.data.tag_name) {
    throw new Error('Could not find remote Nova version');
  }
  return response.data.tag_name.replace('v', '');
};

const formatBoolean = (value: boolean) => (value ? 'Yes' : 'No');

const buildNovaDiagnosisMarkdownDocuments = (
  contextName: string,
  novaDiagnosisResult: NovaDiagnosisResult,
): json2md.DataObject[] => {
  const documents: json2md.DataObject[] = [
    { h2: `Context: \`\`\`${contextName}\`\`\`` },
  ];

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

const generateNovaDiagnosis = async () => {
  const markdownDocuments: json2md.DataObject[] = [
    {
      h1: 'Nova Diagnosis Report',
      p: `Generated at \`\`\`${new Date().toISOString()}\`\`\``,
    },
  ];
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

  const kubeConfig = yaml.parse(
    readFileSync(process.env.KUBECONFIG!!).toString(),
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

  const result = json2md(markdownDocuments);
  const resultFilePath = process.env.DIAGNOSIS_NOVA_FILE_PATH!!;
  const resultDirPath = path.dirname(resultFilePath);
  if (!fs.existsSync(resultDirPath)) {
    fs.mkdirSync(resultDirPath, { recursive: true });
  }
  fs.writeFileSync(resultFilePath, result);
};
void generateNovaDiagnosis();
