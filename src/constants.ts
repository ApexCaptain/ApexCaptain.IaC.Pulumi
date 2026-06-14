import path from 'node:path';
import { TerraformBridgedProvider } from './classes';

export const constants = (() => {
  const project = {
    name: 'ApexCaptain.IaC.Pulumi',
  };

  const author = {
    name: 'ApexCaptain',
    email: 'ayteneve93@gmail.com',
  };

  const branches = {
    main: 'main',
    develop: 'develop',
  };

  // Dirs
  const srcDir = 'src';
  const scriptDir = 'scripts';
  const infraDir = 'infra';
  const kubeConfigDir = process.env.KUBE_CONFIG_DIR_NAME || '.kube';
  const commonDir = 'common';
  const secretsDir = process.env.SECRETS_DIR_NAME || '.secrets';
  const pnpmStoreDir = '.pnpm-store';
  const turboDir = '.turbo';
  const tmpDir = 'tmp';
  const diagnosisDir = process.env.DIAGNOSIS_DIR_NAME || '.diagnosis';
  const cursorDir = '.cursor';
  const ventoyDir = 'ventoy';
  const ventoyUserDataDir = path.join(ventoyDir, 'user-data');
  const ansibleDir = 'ansible';
  const ansibleThirdPartyDir = path.join(ansibleDir, 'third_party');
  const venvDir = process.env.VIRTUAL_ENV_DIR_NAME || '.venv';

  // Files
  const novaConfigFile =
    process.env.NOVA_CONFIG_FILE_NAME || '.nova-config.json';
  const cursorMcpJsonFile = path.join(cursorDir, 'mcp.json');

  const paths = {
    dirs: {
      srcDir,
      scriptDir,
      infraDir,
      commonDir,
      kubeConfigDir,
      secretsDir,
      pnpmStoreDir,
      turboDir,
      tmpDir,
      diagnosisDir,
      cursorDir,
      ventoyDir,
      ventoyUserDataDir,
      ansibleDir,
      ansibleThirdPartyDir,
      venvDir,
    },
    files: {
      novaConfigFile,
      cursorMcpJsonFile,
    },
  };

  const isDevContainer: boolean = JSON.parse(
    (process.env.IS_DEV_CONTAINER ?? 'false').toLocaleLowerCase(),
  );

  const bridgedProviders = {
    terraform: {
      // https://app.pulumi.com/ApexCaptain/idp/registry/opentofu/goauthentik/authentik
      authentik: new TerraformBridgedProvider({
        name: 'authentik',
        providerSource: 'goauthentik/authentik',
        providerVersion: '2026.5.0',
        packagesToOverride: ['typescript', '@types/node'],
      }),
    },
  };

  const pulumiPackages = {
    pulumi: '@pulumi/pulumi',
    kubernetes: '@pulumi/kubernetes',
    command: '@pulumi/command',
    cloudflare: '@pulumi/cloudflare',
    tls: '@pulumi/tls',
    escSdk: '@pulumi/esc-sdk',
    std: '@pulumi/std',
    random: '@pulumi/random',
    oci: '@pulumi/oci',
  };

  const packagesAllowingBuildScripts = [
    pulumiPackages.command,
    pulumiPackages.kubernetes,
    pulumiPackages.std,
    'protobufjs',
    'unrs-resolver',
  ];

  const helmChartRepositoryUrls = {
    'jellyfin.github.io/jellyfin-helm':
      'https://jellyfin.github.io/jellyfin-helm',
    'istio-release.storage.googleapis.com/charts':
      'https://istio-release.storage.googleapis.com/charts',
    'metallb.github.io/metallb': 'https://metallb.github.io/metallb',
    'kubernetes-sigs.github.io/metrics-server':
      'https://kubernetes-sigs.github.io/metrics-server',
    'charts.jetstack.io': 'https://charts.jetstack.io',
    'charts.goauthentik.io': 'https://charts.goauthentik.io',
    'kubernetes-sigs.github.io/nfs-subdir-external-provisioner':
      'https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner',
    'helm.releases.hashicorp.com': 'https://helm.releases.hashicorp.com',
  };

  return {
    project,
    author,
    branches,
    paths,
    isDevContainer,
    bridgedProviders,
    pulumiPackages,
    packagesAllowingBuildScripts,
    helmChartRepositoryUrls,
  };
})();
