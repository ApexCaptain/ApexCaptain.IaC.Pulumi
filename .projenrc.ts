import dns from 'dns/promises';
import path from 'node:path';
import * as pulumiEscSdk from '@pulumi/esc-sdk';
import { LocalWorkspace } from '@pulumi/pulumi/automation';
import axios from 'axios';
import _ from 'lodash';
import { javascript, JsonFile, typescript, YamlFile } from 'projen';
import { GithubCredentials } from 'projen/lib/github/github-credentials';
import { Job } from 'projen/lib/github/workflows-model';
import { ArrowParens } from 'projen/lib/javascript';
import {
  TypeScriptProject,
  TypeScriptProjectOptions,
} from 'projen/lib/typescript';
import { VsCode } from 'projen/lib/vscode';
import * as Nexus from './common/nexus/src';
import * as utils from './common/utils/src';

const constants = (() => {
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

  const srcDir = 'src';
  const scriptDir = 'scripts';
  const infraDir = 'infra';
  const kubeConfigDir = process.env.KUBE_CONFIG_DIR_NAME || '.kube';
  const commonDir = 'common';
  const secretsDir = process.env.SECRETS_DIR_NAME || '.secrets';
  const pnpmStoreDir = '.pnpm-store';
  const turboDir = '.turbo';
  const tmpDir = 'tmp';

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
    },
    files: {},
  };

  const projenCredentials = {
    githubTokenCredential: GithubCredentials.fromPersonalAccessToken({
      secret: 'WORKFLOW_TOKEN',
    }),
  };

  const isDevContainer: boolean = JSON.parse(
    (process.env.IS_DEV_CONTAINER ?? 'false').toLocaleLowerCase(),
  );

  const bridgedProviders = {
    terraform: {
      // https://app.pulumi.com/ApexCaptain/idp/registry/opentofu/goauthentik/authentik
      authentik: new utils.classes.TerraformBridgedProvider({
        name: 'authentik',
        providerSource: 'goauthentik/authentik',
        providerVersion: '2026.2.0',
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
  };

  const packagesAllowingBuildScripts = [
    pulumiPackages.command,
    pulumiPackages.kubernetes,
    pulumiPackages.std,
    'protobufjs',
    'unrs-resolver',
  ];

  return {
    project,
    author,
    branches,
    paths,
    projenCredentials,
    isDevContainer,
    bridgedProviders,
    pulumiPackages,
    packagesAllowingBuildScripts,
  };
})();

const commonProjectWithBridgedProviderOrder: TypeScriptProject[] = [];
const pulumiProjectWithBridgedProviderOrder: TypeScriptProject[] = [];

const sharedProjectOption: Partial<TypeScriptProjectOptions> = {
  tsconfig: {
    compilerOptions: {
      noUnusedLocals: false,
      noUnusedParameters: false,
    },
  },
  deps: [constants.pulumiPackages.pulumi, 'lodash', 'yaml', 'dedent'],
  packageManager: javascript.NodePackageManager.PNPM,
  jest: false,
  depsUpgrade: true,
  depsUpgradeOptions: {
    workflow: false,
  },
  prettierOptions: {
    settings: {
      semi: true,
      arrowParens: ArrowParens.AVOID,
      endOfLine: javascript.EndOfLine.AUTO,
      singleQuote: true,
      tabWidth: 2,
      trailingComma: javascript.TrailingComma.ALL,
    },
  },
};

const rootProject = new typescript.TypeScriptProject(
  _.mergeWith(
    {},
    sharedProjectOption,
    {
      defaultReleaseBranch: constants.branches.main,
      // TypeScript Project Options
      eslintOptions: {
        tsconfigPath: './tsconfig.dev.json',
        dirs: [constants.paths.dirs.srcDir],
        devdirs: [constants.paths.dirs.scriptDir],
        ignorePatterns: ['/**/node_modules/*', '/**/pnpm-store/*'],
        prettier: true,
      },
      projenrcTs: true,
      tsconfigDev: {
        include: [constants.paths.dirs.scriptDir].map(
          eachDevDir => `${eachDevDir}/**/*.ts`,
        ),
      },

      // Node Project Options
      npmignoreEnabled: false,
      buildWorkflow: false,
      release: false,
      depsUpgrade: true,
      depsUpgradeOptions: {
        workflowOptions: {
          schedule: javascript.UpgradeDependenciesSchedule.WEEKLY,
          projenCredentials: constants.projenCredentials.githubTokenCredential,
          assignees: [constants.author.name],
          branches: [constants.branches.develop],
        },
        pullRequestTitle: 'Upgrade Node Deps',
        workflow: true,
      },
      prettier: true,
      // Node Package Options
      license: 'MIT',
      licensed: true,
      // GitHub Project Options
      githubOptions: {
        pullRequestLintOptions: {
          semanticTitleOptions: {
            types: ['test', 'feat', 'fix', 'chore', 'dev'],
          },
        },
      },
      projenCredentials: constants.projenCredentials.githubTokenCredential,
      authorName: constants.author.name,
      authorEmail: constants.author.email,
      name: constants.project.name,

      gitignore: [
        '.DS_STORE',
        'Pulumi*.yaml',
        'Pulumi*.yml',
        constants.paths.dirs.turboDir,
        constants.paths.dirs.tmpDir,

        `/${constants.paths.dirs.secretsDir}`,
        `/${constants.paths.dirs.kubeConfigDir}`,
        `/${constants.paths.dirs.pnpmStoreDir}`,
      ],
      deps: [],
      devDeps: [
        constants.pulumiPackages.escSdk,
        'lodash',
        '@types/lodash',
        'turbo',
        'axios',
      ],
    },
    utils.functions.mergeCustomizer,
  ),
);

const modifyUpgradeWorkflow = async () => {
  const upgradeWorkflow = rootProject.upgradeWorkflow;
  if (!upgradeWorkflow) return;

  const upgradeJob = upgradeWorkflow.workflows[0].jobs.upgrade as Job;

  const upgradeJobSteps = upgradeJob.steps;

  upgradeJobSteps.splice(
    upgradeJobSteps.findIndex(
      eachStep => eachStep.name == 'Install dependencies',
    ) + 1,
    0,
    {
      name: 'Build Projects',
      run: 'pnpm build:workspaces',
    },
    // {
    //   name: 'Initialize Projen',
    //   run: 'pnpm exec projen',
    // },
  );
};

const inflateCommonProject = (option: {
  projectName: string;
  deps?: string[];
  commonDeps?: string[];
  devDeps?: string[];
  bridgedProviders?: utils.classes.BridgedProvider[];
}) => {
  const outdir = path.join(constants.paths.dirs.commonDir, option.projectName);
  const name = utils.functions.kebabCase(option.projectName);
  const project = new typescript.TypeScriptProject(
    _.mergeWith(
      {},
      sharedProjectOption,
      {
        defaultReleaseBranch: constants.branches.main,
        parent: rootProject,
        name: `@common/${name}`,
        outdir,
        deps: [
          ...(option.deps ?? []),

          ...(option.commonDeps ?? []).map(
            eachCommonDep => `${eachCommonDep}@workspace:*`,
          ),
        ],
        devDeps: option.devDeps ?? [],
      },
      utils.functions.mergeCustomizer,
    ),
  );

  if (option.bridgedProviders && option.bridgedProviders.length > 0) {
    commonProjectWithBridgedProviderOrder.push(project);
    const pulumiYamlFile = new YamlFile(project, 'Pulumi.yaml', {
      obj: {
        name,
        runtime: {
          name: 'nodejs',
        },
        packages: option.bridgedProviders
          ? Object.fromEntries(
              option.bridgedProviders.map(eachBridgedProvider => [
                eachBridgedProvider.name,
                eachBridgedProvider.toJson(),
              ]),
            )
          : undefined,
      },
      editGitignore: false,
    });
  }

  return { project };
};

const inflatePulumiProject = (option: {
  projectName: string;
  stages: utils.enums.StackStage[];
  description?: string;
  commonDeps?: string[];
  infraDeps?: string[];
  deps?: string[];
  devDeps?: string[];
  esc?: Nexus.abstract.AbstractEsc<any>[];
  bridgedProviders?: utils.classes.BridgedProvider[];
}) => {
  if (!option.stages.includes(utils.enums.StackStage.PROD)) {
    throw new Error(
      `${option.projectName} must include ${utils.enums.StackStage.PROD} stage`,
    );
  }

  if (
    option.infraDeps &&
    option.infraDeps.some(each => !each.startsWith('@infra/'))
  ) {
    throw new Error(`${option.projectName} infraDeps must start with @infra/`);
  }
  if (
    option.commonDeps &&
    option.commonDeps.some(each => !each.startsWith('@common/'))
  ) {
    throw new Error(
      `${option.projectName} commonDeps must start with @common/`,
    );
  }
  if (
    option.deps &&
    option.deps.some(
      each => each.startsWith('@common/') || each.startsWith('@infra/'),
    )
  ) {
    throw new Error(
      `${option.projectName} deps must not start with @common/ or @infra/`,
    );
  }
  if (
    option.devDeps &&
    option.devDeps.some(
      each => each.startsWith('@common/') || each.startsWith('@infra/'),
    )
  ) {
    throw new Error(
      `${option.projectName} devDeps must not start with @common/ or @infra/`,
    );
  }

  const outdir = path.join(constants.paths.dirs.infraDir, option.projectName);
  const name = utils.functions.kebabCase(option.projectName);
  const project = new typescript.TypeScriptProject(
    _.mergeWith(
      {},
      sharedProjectOption,
      {
        defaultReleaseBranch: constants.branches.main,
        parent: rootProject,
        name: `@infra/${name}`,
        outdir,
        deps: [
          ...(option.deps ?? []),

          ...(option.infraDeps ?? []).map(
            eachInfraDep => `${eachInfraDep}@workspace:*`,
          ),

          ...(option.commonDeps ?? []).map(
            eachCommonDep => `${eachCommonDep}@workspace:*`,
          ),
        ],
        devDeps: option.devDeps ?? [],
      },
      utils.functions.mergeCustomizer,
    ),
  );

  if (option.bridgedProviders && option.bridgedProviders.length > 0) {
    pulumiProjectWithBridgedProviderOrder.push(project);
  }

  const defaultPulumiYamlFile = new YamlFile(project, 'Pulumi.yaml', {
    obj: {
      name,
      description: option.description ?? `${option.projectName} Pulumi project`,
      runtime: {
        name: 'nodejs',
        options: {
          packagemanager: 'pnpm',
        },
      },
      packages: option.bridgedProviders
        ? Object.fromEntries(
            option.bridgedProviders.map(eachBridgedProvider => [
              eachBridgedProvider.name,
              eachBridgedProvider.toJson(),
            ]),
          )
        : undefined,
      main: 'src/index.ts',
    },
    editGitignore: false,
  });

  const stageStacksPulumiYamlFiles = option.stages.map(eachStage => {
    return new YamlFile(project, `Pulumi.${eachStage}.yaml`, {
      obj: {
        environment: option.esc?.map(eachEsc =>
          eachEsc.getEscNameWithStage(eachStage),
        ),
      },
      editGitignore: false,
    });
  });

  project.postSynthesize = async () => {
    for (const eachStackStage of option.stages) {
      await LocalWorkspace.createOrSelectStack({
        stackName: eachStackStage,
        workDir: outdir,
      });
    }
  };

  project.addScripts({
    'pulumi:preview': `pulumi preview --stack \${PULUMI_STACK:-${utils.enums.StackStage.PROD}}`,
    'pulumi:up': `pulumi preview --stack \${PULUMI_STACK:-${utils.enums.StackStage.PROD}} --expect-no-changes || pulumi up --stack \${PULUMI_STACK:-${utils.enums.StackStage.PROD}}`,
  });

  if (option.infraDeps && option.infraDeps.length > 0) {
    new JsonFile(project, 'turbo.json', {
      obj: {
        $schema: 'https://turbo.build/schema.json',
        extends: ['//'],
        tasks: {
          'pulumi:preview': {
            dependsOn: [
              '^build',
              'build',
              ...option.infraDeps.map(
                eachInfraDep => `${eachInfraDep}#pulumi:preview`,
              ),
            ],
          },
          'pulumi:up': {
            dependsOn: [
              '^build',
              'build',
              ...option.infraDeps.map(
                eachInfraDep => `${eachInfraDep}#pulumi:up`,
              ),
            ],
            interactive: true,
          },
        },
      },
    });
  }

  return {
    project,
    defaultPulumiYamlFile,
    stageStacksPulumiYamlFiles,
  };
};

const initPulumiEsc = async () => {
  if (!constants.isDevContainer) {
    return;
  }
  const accountName = process.env.PULUMI_APEX_CAPTAIN_ACCOUNT_NAME!!;

  const workstationIpV4Address = (
    await dns.lookup(process.env.WORKSTATION_DOMAIN_IPTIME!!)
  ).address;

  const pulumiEscClient = new pulumiEscSdk.EscApi(
    new pulumiEscSdk.Configuration({
      accessToken: process.env.PULUMI_ACCESS_TOKEN!!,
    }),
  );

  await Nexus.esc.commonEsc.upsertEsc(
    accountName,
    pulumiEscClient,
    {
      workstationIptimeDomain: process.env.WORKSTATION_DOMAIN_IPTIME,
      workstationIpV4Address,
      istioNetwork: {
        meshId: process.env.ISTIO_MESH_ID,
        workstationClusterName: process.env.ISTIO_WORKSTATION_CLUSTER_NAME,
        workstationClusterNetwork:
          process.env.ISTIO_WORKSTATION_CLUSTER_NETWORK,
        workstationDefaultCalcioIpv4IpPoolsCidrBlock:
          process.env.WORKSTATION_DEFAULT_CALCIO_IPV4_IP_POOLS_CIDR_BLOCK,
      },
      nordLynx: {
        privateKey: (
          await axios.get(
            'https://api.nordvpn.com/v1/users/services/credentials',
            {
              auth: {
                username: 'token',
                password: process.env.NORD_VPN_APEX_CAPTAIN_ACCESS_TOKEN!!,
              },
            },
          )
        ).data.nordlynx_private_key as string,
      },
    },
    {
      prod: {},
      dev: {},
    },
  );

  await Nexus.esc.k8sWorkstationSystemEsc.upsertEsc(
    accountName,
    pulumiEscClient,
    {
      nodes: {
        node0: {
          hostName: process.env.WORKSTATION_NODE0_NAME,
        },
      },
      kubeConfig: {
        certificateAuthorityData:
          process.env.WORKSTATION_K8S_KUBECONFIG_CERTIFICATE_AUTHORITY_DATA,
        clientCertificateData:
          process.env.WORKSTATION_K8S_KUBECONFIG_CLIENT_CERTIFICATE_DATA,
        clientKeyData: process.env.WORKSTATION_K8S_KUBECONFIG_CLIENT_KEY_DATA,
        server: process.env.WORKSTATION_K8S_KUBECONFIG_SERVER,
      },
      loadbalancer: {
        metallb: {
          ipRange: process.env.WORKSTATION_METALLB_LOADBALANCER_IP_RANGE,
          ingressGatewayIp: process.env.WORKSTATION_METALLB_INGRESS_GATEWAY_IP,
          additionalPort: {
            nfsSftp: parseInt(
              process.env.WORKSTATION_METALLB_ADDITIONAL_PORT_NFS_SFTP!!,
            ),
          },
        },
      },
      nfs: {
        localPathHdd0: process.env.WORKSTATION_NFS_LOCAL_PATH_HDD0,
        localPathSsd0: process.env.WORKSTATION_NFS_LOCAL_PATH_SSD0,
        diskSizeHdd0: process.env.WORKSTATION_NFS_DISK_SIZE_HDD0,
        diskSizeSsd0: process.env.WORKSTATION_NFS_DISK_SIZE_SSD0,
        sftp: {
          userName: process.env.WORKSTATION_NFS_SFTP_USER_NAME,
        },
      },
      authentik: {
        secretKey: process.env.AUTHENTIK_SECRET_KEY,
        bootstrap: {
          token: process.env.AUTHENTIK_BOOTSTRAP_TOKEN,
          email: process.env.AUTHENTIK_BOOTSTRAP_EMAIL,
          password: process.env.AUTHENTIK_BOOTSTRAP_PASSWORD,
        },
        postgresqlPassword: process.env.AUTHENTIK_POSTGRESQL_PASSWORD,
        redisPassword: process.env.AUTHENTIK_REDIS_PASSWORD,
        oauth: {
          allowedEmails: process.env.AUTHENTIK_ALLOWED_EMAILS!!.split(','),
          google: {
            clientId: process.env.GOOGLE_OAUTH_AUTHENTIK_APP_CLIENT_ID,
            clientSecret: process.env.GOOGLE_OAUTH_AUTHENTIK_APP_CLIENT_SECRET,
          },
        },
      },
    },
    {
      prod: {},
    },
  );

  await Nexus.esc.cloudflareEsc.upsertEsc(
    accountName,
    pulumiEscClient,
    {
      apiToken: process.env.CLOUDFLARE_APEX_CAPTAIN_API_TOKEN,
      email: process.env.CLOUDFLARE_APEX_CAPTAIN_EMAIL,
      zones: {
        ayteneve93com: {
          id: process.env.CLOUDFLARE_APEX_CAPTAIN_AYTENEVE93_COM_ZONE_ID,
        },
      },
    },
    {
      prod: {},
    },
  );

  await Nexus.esc.k8sWorkstationAppsEsc.upsertEsc(
    accountName,
    pulumiEscClient,
    {},
    {
      prod: {},
      dev: {},
    },
  );

  await Nexus.esc.k8sWorkstationToolsEsc.upsertEsc(
    accountName,
    pulumiEscClient,
    {},
    {
      prod: {},
    },
  );
};

void (async () => {
  await modifyUpgradeWorkflow();

  // Common
  const commonProjects = (() => {
    const bridgedProviderProject = inflateCommonProject({
      projectName: 'bridged-provider',
      bridgedProviders: [constants.bridgedProviders.terraform.authentik],
    });

    const utilsProject = inflateCommonProject({
      projectName: 'utils',
      deps: ['flatley', 'flat', 'axios', 'semver', 'chalk', 'zod'],
      devDeps: ['@types/semver'],
    });

    const customResourcesProject = inflateCommonProject({
      projectName: 'custom-resources',
      commonDeps: [utilsProject.project.package.packageName],
      deps: [
        constants.pulumiPackages.kubernetes,
        constants.pulumiPackages.command,
        constants.pulumiPackages.tls,
        constants.pulumiPackages.random,
        'axios',
      ],
    });

    const nexusProject = inflateCommonProject({
      projectName: 'nexus',
      commonDeps: [
        utilsProject.project.package.packageName,
        customResourcesProject.project.package.packageName,
      ],
      deps: [
        constants.pulumiPackages.escSdk,
        constants.pulumiPackages.std,
        'zod',
      ],
    });

    return {
      bridgedProviderProject,
      utilsProject,
      customResourcesProject,
      nexusProject,
    };
  })();

  // Init Pulumi ESC
  await initPulumiEsc();

  // Pulumi Projects
  const pulumiProjects = (() => {
    const cloudflareProject = inflatePulumiProject({
      projectName: 'cloudflare',
      stages: [utils.enums.StackStage.PROD],
      deps: [constants.pulumiPackages.cloudflare],
      commonDeps: [
        commonProjects.utilsProject.project.package.packageName,
        commonProjects.nexusProject.project.package.packageName,
      ],
      esc: [Nexus.esc.commonEsc, Nexus.esc.cloudflareEsc],
    });

    const k8sWorkstationSystemProject = inflatePulumiProject({
      projectName: 'k8s-workstation-system',
      stages: [utils.enums.StackStage.PROD],
      deps: [constants.pulumiPackages.kubernetes],
      commonDeps: [
        commonProjects.bridgedProviderProject.project.package.packageName,
        commonProjects.utilsProject.project.package.packageName,
        commonProjects.customResourcesProject.project.package.packageName,
        commonProjects.nexusProject.project.package.packageName,
      ],
      infraDeps: [cloudflareProject.project.package.packageName],
      esc: [Nexus.esc.commonEsc, Nexus.esc.k8sWorkstationSystemEsc],
    });

    const k8sWorkstationToolsProject = inflatePulumiProject({
      projectName: 'k8s-workstation-tools',
      stages: [utils.enums.StackStage.PROD],
      deps: [constants.pulumiPackages.kubernetes, 'timezone-enum'],
      commonDeps: [
        commonProjects.bridgedProviderProject.project.package.packageName,
        commonProjects.utilsProject.project.package.packageName,
        commonProjects.customResourcesProject.project.package.packageName,
        commonProjects.nexusProject.project.package.packageName,
      ],
      infraDeps: [
        cloudflareProject.project.package.packageName,
        k8sWorkstationSystemProject.project.package.packageName,
      ],
      esc: [Nexus.esc.commonEsc, Nexus.esc.k8sWorkstationToolsEsc],
    });

    const k8sWorkstationAppsProject = inflatePulumiProject({
      projectName: 'k8s-workstation-apps',
      stages: [utils.enums.StackStage.PROD, utils.enums.StackStage.DEV],
      deps: [constants.pulumiPackages.kubernetes],
      commonDeps: [
        commonProjects.bridgedProviderProject.project.package.packageName,
        commonProjects.utilsProject.project.package.packageName,
        commonProjects.customResourcesProject.project.package.packageName,
        commonProjects.nexusProject.project.package.packageName,
      ],
      infraDeps: [
        cloudflareProject.project.package.packageName,
        k8sWorkstationSystemProject.project.package.packageName,
      ],
      esc: [Nexus.esc.k8sWorkstationAppsEsc],
    });

    const authentikOutpostProject = inflatePulumiProject({
      projectName: 'authentik-outpost',
      stages: [utils.enums.StackStage.PROD],
      deps: [],
      commonDeps: [
        commonProjects.bridgedProviderProject.project.package.packageName,
        commonProjects.utilsProject.project.package.packageName,
        commonProjects.nexusProject.project.package.packageName,
      ],
      infraDeps: [
        cloudflareProject.project.package.packageName,
        k8sWorkstationToolsProject.project.package.packageName,
        k8sWorkstationAppsProject.project.package.packageName,
        k8sWorkstationSystemProject.project.package.packageName,
      ],
    });

    return {
      cloudflareProject,
      k8sWorkstationSystemProject,
      k8sWorkstationToolsProject,
      k8sWorkstationAppsProject,
      authentikOutpostProject,
    };
  })();

  const workspacePackageFilters = [
    `"./${constants.paths.dirs.commonDir}/*"`,
    `"./${constants.paths.dirs.infraDir}/*"`,
  ].join(' --filter ');

  const infraPackageFilter = `"./${constants.paths.dirs.infraDir}/*"`;

  // Scripts & Tasks
  rootProject.defaultTask?.addSteps({
    exec: `pnpm pulumi:install`,
  });

  rootProject.addScripts({
    'build:workspaces': `turbo run build --filter ${workspacePackageFilters}`,
    'build:infra': `turbo run build --filter ${infraPackageFilter}`,

    'pulumi:preview': `turbo run pulumi:preview --filter ${infraPackageFilter}`,
    'pulumi:up': `turbo run pulumi:up --filter ${infraPackageFilter} --ui=tui`,
    'postpulumi:up': `ts-node scripts/merge-kube-config.script.ts`,
    'pulumi:install': [
      ...commonProjectWithBridgedProviderOrder,
      ...pulumiProjectWithBridgedProviderOrder,
    ]
      .map(
        eachProject =>
          `pulumi install --cwd ./${path.relative(rootProject.outdir, eachProject.outdir)}`,
      )
      .join(' && '),

    postprojen: `pnpm build`,
    postbuild: `turbo run build --filter ${workspacePackageFilters}`,
    postupgrade: `turbo run upgrade --filter ${workspacePackageFilters} --concurrency=1`,
  });

  // Turbo.json file
  new JsonFile(rootProject, 'turbo.json', {
    obj: {
      $schema: 'https://turbo.build/schema.json',
      tasks: {
        build: {
          dependsOn: ['^build'],
          outputs: ['lib/**', 'dist/**'],
        },
        compile: {
          dependsOn: ['^build'],
          outputs: ['lib/**'],
        },
        test: {
          dependsOn: ['build'],
        },
        upgrade: {
          cache: false,
        },
        'pulumi:preview': {
          dependsOn: ['^build', 'build'],
          cache: false,
          passThroughEnv: ['PULUMI_*'],
        },
        'pulumi:up': {
          dependsOn: ['^build', 'build'],
          cache: false,
          interactive: true,
          passThroughEnv: ['PULUMI_*'],
        },
      },
    },
  });

  // VsCode Settings
  new VsCode(rootProject).settings.addSettings(
    utils.functions.flatley(
      {
        files: {
          associations: new utils.classes.VsCodeObject({
            '.ToDo': 'markdown',
          }),
        },
        todohighlight: {
          toggleURI: true,
          isCaseSensitive: false,
          keywords: new utils.classes.VsCodeObject([
            { text: '@' + 'ToDo', color: 'red', backgroundColor: 'black' },
            { text: '@' + 'note', color: 'blue', backgroundColor: 'lightblue' },
          ]),
          exclude: ['**/node_modules/**', '.vscode'],
        },
        workbench: {
          colorTheme: 'Tomorrow Night Blue',
        },
        'material-icon-theme': {
          files: {
            associations: new utils.classes.VsCodeObject({
              '.projenrc.ts': 'controller',
              'index.ts': 'contributing',
              '*.enum.ts': 'scheme',
              '*.function.ts': 'fortran',
              '*.type.ts': 'toml',
              '*.esc.ts': 'key',
              '*.res.ts': 'scheme',
              '*.data.ts': 'scheme',
              'contract.ts': 'bbx',
            }),
          },
          folders: {
            associations: new utils.classes.VsCodeObject({
              crd: 'kubernetes',
              abstract: 'class',
              '.kube': 'kubernetes',
              workstation: 'home',
              '.projen': 'project',
            }),
          },
        },
      },
      {
        safe: true,
        coercion: [
          {
            test: (__: string, value: any) => {
              return utils.classes.VsCodeObject.isVscodeObject(value);
            },
            transform: (value: utils.classes.VsCodeObject<any>) => value.object,
          },
        ],
      },
    ),
  );

  const bridgedProviderOverrides = Object.fromEntries(
    Object.values(constants.bridgedProviders)
      .flatMap(eachBridgedProvider => Object.values(eachBridgedProvider))
      .flatMap(eachBridgedProvider =>
        eachBridgedProvider.packagesToOverride.map(eachPackage => [
          `@pulumi/${eachBridgedProvider.name}>${eachPackage}`,
          `$${eachPackage}`,
        ]),
      ),
  );

  // pnpm-workspace.yaml file
  new YamlFile(rootProject, 'pnpm-workspace.yaml', {
    obj: {
      confirmModulesPurge: false,
      packages: [
        `${constants.paths.dirs.commonDir}/*`,
        `${constants.paths.dirs.infraDir}/*`,
      ],
      // Bridged Providers에 공통 네이밍 컨벤션이 있을 경우 Dynamic하게 설정될 수 있도록 변경
      allowBuilds: Object.fromEntries([
        ...Object.values(constants.bridgedProviders)
          .flatMap(eachBridgedProvider => Object.values(eachBridgedProvider))
          .map(eachBridgedProvider => [
            `@pulumi/${eachBridgedProvider.name}`,
            true,
          ]),
        ...constants.packagesAllowingBuildScripts.map(eachPackage => [
          eachPackage,
          true,
        ]),
      ]),
      overrides: bridgedProviderOverrides,
    },
  });

  rootProject.synth();
})();
