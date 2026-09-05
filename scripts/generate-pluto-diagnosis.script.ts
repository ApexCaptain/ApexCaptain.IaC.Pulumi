import { execSync } from 'child_process';
import fs, { readFileSync } from 'fs';
import path from 'path';
import axios from 'axios';
import dedent from 'dedent';
import json2md from 'json2md';
import semver from 'semver';
import yaml from 'yaml';
import { KubeConfig } from '../common/utils/src/interfaces/kubeconfig.interface';

type PlutoDiagnosisResult = {
  items?: {
    name: string;
    namespace: string;
    api: {
      version: string;
      kind: string;
      'deprecated-in': string;
      'removed-in': string;
      'replacement-api': string;
      component: string;
    };
    deprecated: boolean;
    removed: boolean;
  }[];
  'target-versions': Record<string, string>;
};

const getTargetK8sVersion = () => {
  const rawVersion = process.env.DIAGNOSIS_PLUTO_TARGET_K8S_VERSION ?? '1.35.0';
  return rawVersion.startsWith('v') ? rawVersion : `v${rawVersion}`;
};

const getLocalPlutoVersion = () => {
  const localVersion = execSync('pluto version')
    .toString()
    .match(/Version:([0-9.]+)/)?.[1];

  if (!localVersion) {
    throw new Error('Could not find local Pluto version');
  }

  return localVersion;
};

const getRemotePlutoVersion = async () => {
  const response = await axios.get(
    'https://api.github.com/repos/fairwindsops/pluto/releases/latest',
    {
      headers: {
        'User-Agent': 'axios-version-checker',
      },
    },
  );
  if (!response.data.tag_name) {
    throw new Error('Could not find remote Pluto version');
  }
  return response.data.tag_name.replace('v', '');
};

const formatBoolean = (value: boolean) => (value ? 'Yes' : 'No');

const buildPlutoDiagnosisMarkdownDocuments = (
  contextName: string,
  targetK8sVersion: string,
  plutoDiagnosisResult: PlutoDiagnosisResult,
): json2md.DataObject[] => {
  const documents: json2md.DataObject[] = [
    { h2: `Context: \`\`\`${contextName}\`\`\`` },
  ];

  const items = plutoDiagnosisResult.items ?? [];
  const removedItems = items.filter(eachItem => eachItem.removed);
  const deprecatedOnlyItems = items.filter(
    eachItem => eachItem.deprecated && !eachItem.removed,
  );

  if (items.length === 0) {
    documents.push({
      h3: 'Deprecated or Removed API Versions',
      p: `No deprecated or removed API versions found for Kubernetes target \`\`\`${targetK8sVersion}\`\`\`.`,
    });
  } else {
    documents.push({ h3: 'Deprecated or Removed API Versions' });

    if (removedItems.length > 0) {
      documents.push(
        { h4: 'Removed (Breaking)' },
        {
          table: {
            headers: [
              'Name',
              'Namespace',
              'Kind',
              'API Version',
              'Replacement',
              'Removed In',
            ],
            rows: removedItems.map(eachItem => [
              eachItem.name,
              eachItem.namespace || '-',
              eachItem.api.kind,
              eachItem.api.version,
              eachItem.api['replacement-api'] || '-',
              eachItem.api['removed-in'],
            ]),
          },
        },
      );
    }

    if (deprecatedOnlyItems.length > 0) {
      documents.push(
        { h4: 'Deprecated Only' },
        {
          table: {
            headers: [
              'Name',
              'Namespace',
              'Kind',
              'API Version',
              'Replacement',
              'Deprecated In',
            ],
            rows: deprecatedOnlyItems.map(eachItem => [
              eachItem.name,
              eachItem.namespace || '-',
              eachItem.api.kind,
              eachItem.api.version,
              eachItem.api['replacement-api'] || '-',
              eachItem.api['deprecated-in'],
            ]),
          },
        },
      );
    }
  }

  return documents;
};

const generatePlutoDiagnosis = async () => {
  const targetK8sVersion = getTargetK8sVersion();

  const markdownDocuments: json2md.DataObject[] = [
    {
      h1: 'Pluto Diagnosis Report',
      p: [
        `Generated at \`\`\`${new Date().toISOString()}\`\`\``,
        `Target Kubernetes Version: \`\`\`${targetK8sVersion}\`\`\``,
      ],
    },
  ];

  const localVersion = getLocalPlutoVersion();
  const remoteVersion = await getRemotePlutoVersion();
  if (semver.gt(remoteVersion, localVersion)) {
    markdownDocuments.push({
      h2: 'Pluto CLI Version Mismatch',
      p: [
        `Remote version \`\`\`${remoteVersion}\`\`\` is greater than local version \`\`\`${localVersion}\`\`\``,
        'Please update your Pluto CLI to the latest version.',
      ],
    });
  }

  const kubeConfig = yaml.parse(
    readFileSync(process.env.KUBECONFIG!!).toString(),
  ) as KubeConfig;
  const contextNames = kubeConfig.contexts.map(eachContext => eachContext.name);

  contextNames.forEach(eachContextName => {
    const plutoDiagnosisResult: PlutoDiagnosisResult = JSON.parse(
      execSync(dedent`
        pluto detect-all-in-cluster \
          --kube-context ${eachContextName} \
          --components k8s \
          --target-versions k8s=${targetK8sVersion} \
          --output json \
          --ignore-deprecations \
          --ignore-removals \
          --ignore-unavailable-replacements
      `).toString(),
    );
    markdownDocuments.push(
      ...buildPlutoDiagnosisMarkdownDocuments(
        eachContextName,
        targetK8sVersion,
        plutoDiagnosisResult,
      ),
    );
  });

  const result = json2md(markdownDocuments);
  const resultFilePath = process.env.DIAGNOSIS_PLUTO_FILE_PATH!!;
  const resultDirPath = path.dirname(resultFilePath);
  if (!fs.existsSync(resultDirPath)) {
    fs.mkdirSync(resultDirPath, { recursive: true });
  }
  fs.writeFileSync(resultFilePath, result);
};
void generatePlutoDiagnosis();
