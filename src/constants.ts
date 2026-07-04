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
  const githubGeneratedDir = '.github/generated';
  const venvDir = process.env.VIRTUAL_ENV_DIR_NAME || '.venv';
  const keysDir = process.env.KEYS_DIR_NAME || '.keys';

  // Files
  const novaConfigFile =
    process.env.NOVA_CONFIG_FILE_NAME || '.nova-config.json';
  const cursorMcpJsonFile = path.join(cursorDir, 'mcp.json');
  const workstationSshPrivateKeyFile = path.join(
    keysDir,
    process.env.WORKSTATION_SSH_PRIVATE_KEY_FILE_NAME || 'workstation.key',
  );
  const ansibleWorkstationInventoryFile = path.join(
    ansibleDir,
    'workstation/inventory/inventory.ini',
  );
  const githubGeneratedCommitMessageFile = path.join(
    githubGeneratedDir,
    'commit-message.txt',
  );
  const githubGeneratedPullRequestTitleFile = path.join(
    githubGeneratedDir,
    'pull-request-title.txt',
  );
  const githubGeneratedPullRequestBodyFile = path.join(
    githubGeneratedDir,
    'pull-request-body.md',
  );

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
      keysDir,
      githubGeneratedDir,
    },
    files: {
      novaConfigFile,
      cursorMcpJsonFile,
      workstationSshPrivateKeyFile,
      ansibleWorkstationInventoryFile,
      githubGeneratedCommitMessageFile,
      githubGeneratedPullRequestTitleFile,
      githubGeneratedPullRequestBodyFile,
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
    time: '@pulumiverse/time',
    vault: '@pulumi/vault',
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
    'charts.jetstack.io': 'https://charts.jetstack.io',
    'charts.goauthentik.io': 'https://charts.goauthentik.io',
    'helm.releases.hashicorp.com': 'https://helm.releases.hashicorp.com',
    'charts.longhorn.io': 'https://charts.longhorn.io',
    'go-vikunja/helm-chart/vikunja':
      'oci://ghcr.io/go-vikunja/helm-chart/vikunja',
    'cloudnative-pg.github.io/charts':
      'https://cloudnative-pg.github.io/charts',
    'stakater.github.io/stakater-charts':
      'https://stakater.github.io/stakater-charts',
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
