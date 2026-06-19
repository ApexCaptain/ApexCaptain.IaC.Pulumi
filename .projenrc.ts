import { randomBytes } from 'crypto';
import dns from 'dns/promises';
import fs from 'fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import * as pulumiEscSdk from '@pulumi/esc-sdk';
import { LocalWorkspace } from '@pulumi/pulumi/automation';
import axios from 'axios';
import CronTime from 'cron-time-generator';
import dedent from 'dedent';
import Handlebars from 'handlebars';
import _, { constant } from 'lodash';
import {
  IniFile,
  javascript,
  JsonFile,
  TextFile,
  typescript,
  YamlFile,
} from 'projen';
import { GithubCredentials } from 'projen/lib/github/github-credentials';
import { Job } from 'projen/lib/github/workflows-model';
import { ArrowParens } from 'projen/lib/javascript';
import { RequirementsFile } from 'projen/lib/python';
import {
  TypeScriptProject,
  TypeScriptProjectOptions,
} from 'projen/lib/typescript';
import { VsCode } from 'projen/lib/vscode';
import { sha512 } from 'sha512-crypt-ts';
import Timezone from 'timezone-enum';
import * as Nexus from './common/nexus/src';
import * as utils from './common/utils/src';
import * as src from './src';

const commonProjectWithBridgedProviderOrder: TypeScriptProject[] = [];
const pulumiProjectWithBridgedProviderOrder: TypeScriptProject[] = [];

const sharedProjectOption: Partial<TypeScriptProjectOptions> = {
  tsconfig: {
    compilerOptions: {
      noUnusedLocals: false,
      noUnusedParameters: false,
    },
  },
  deps: [src.constants.pulumiPackages.pulumi, 'lodash', 'yaml', 'dedent'],
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
  addPackageManagerToDevEngines: false,
};

const rootProject = new typescript.TypeScriptProject(
  _.mergeWith(
    {},
    sharedProjectOption,
    ((): TypeScriptProjectOptions => ({
      defaultReleaseBranch: src.constants.branches.main,
      // TypeScript Project Options
      eslintOptions: {
        tsconfigPath: './tsconfig.dev.json',
        dirs: [src.constants.paths.dirs.srcDir],
        devdirs: [src.constants.paths.dirs.scriptDir],
        ignorePatterns: ['/**/node_modules/*', '/**/pnpm-store/*'],
        prettier: true,
      },
      projenrcTs: true,
      tsconfigDev: {
        include: [src.constants.paths.dirs.scriptDir].map(
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
          assignees: [src.constants.author.name],
          branches: [src.constants.branches.develop],
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
      projenCredentials: GithubCredentials.fromPersonalAccessToken({
        secret: 'WORKFLOW_TOKEN',
      }),
      authorName: src.constants.author.name,
      authorEmail: src.constants.author.email,
      name: src.constants.project.name,

      gitignore: [
        '.DS_STORE',
        'commit-message.txt',
        'pull-request.md',
        'Pulumi*.yaml',
        'Pulumi*.yml',
        'inventory.ini',
        src.constants.paths.dirs.turboDir,
        src.constants.paths.dirs.tmpDir,
        `/${src.constants.paths.dirs.keysDir}`,
        `/${src.constants.paths.dirs.secretsDir}`,
        `/${src.constants.paths.dirs.kubeConfigDir}`,
        `/${src.constants.paths.dirs.pnpmStoreDir}`,
        `/${src.constants.paths.dirs.ventoyUserDataDir}`,
        `/${src.constants.paths.dirs.venvDir}`,
      ],
      deps: ['chalk', 'axios', 'semver', 'flat', 'flatley'],
      devDeps: [
        src.constants.pulumiPackages.escSdk,

        'cron-time-generator',

        'timezone-enum',

        'turbo',

        'lodash',
        '@types/lodash',

        '@types/semver',

        'json2md',
        '@types/json2md',

        'sha512-crypt-ts',

        'handlebars',

        'ssh2',
        '@types/ssh2',
      ],
    }))(),
    utils.functions.mergeCustomizer,
  ),
);

const modifyUpgradeWorkflow = async () => {
  const upgradeWorkflow = rootProject.upgradeWorkflow;
  if (!upgradeWorkflow) return;

  const upgradeJob = upgradeWorkflow.workflows[0].jobs.upgrade as Job;
  const upgradeJobSteps = upgradeJob.steps;

  // @Note Workflow Schedule에 강제로 Timezone 설정. 매우 지저분, 눈이 썩을 거 같음.
  // @ToDo Timezone 설정 나온지 3개월은 되었는데 Projen 이놈들 이거 언제 업뎃 해주려나? Issue 한 번 올려서 물어봐야 할듯
  upgradeWorkflow.workflows[0].on({
    schedule: [
      {
        cron: CronTime.everyWeekAt(1, 1), // 매주 월요일 새벽 1시
        timezone: Timezone['Asia/Seoul'],
      } as any,
    ],
  });

  // Build Projects Step 추가
  upgradeJobSteps.splice(
    upgradeJobSteps.findIndex(
      eachStep => eachStep.name == 'Install dependencies',
    ) + 1,
    0,
    {
      name: 'Build Projects',
      run: 'pnpm build:workspaces',
    },
  );

  // Deps Upgrade Step에 Pulumi Access Token 및 기타 환경변수 추가
  upgradeJobSteps.splice(
    upgradeJobSteps.findIndex(
      eachStep => eachStep.name == 'Upgrade dependencies',
    ),
    1,
    {
      name: 'Upgrade dependencies',
      run: 'pnpm exec projen upgrade',
      env: {
        CI: '0',
        PULUMI_ACCESS_TOKEN: '${{ secrets.PULUMI_ACCESS_TOKEN }}',
      },
    },
  );
};

const inflateCommonProject = (option: {
  projectName: string;
  deps?: string[];
  commonDeps?: string[];
  devDeps?: string[];
  bridgedProviders?: src.classes.BridgedProvider[];
}) => {
  const outdir = path.join(
    src.constants.paths.dirs.commonDir,
    option.projectName,
  );
  const name = utils.functions.kebabCase(option.projectName);
  const project = new typescript.TypeScriptProject(
    _.mergeWith(
      {},
      sharedProjectOption,
      ((): TypeScriptProjectOptions => ({
        defaultReleaseBranch: src.constants.branches.main,
        parent: rootProject,
        name: `@common/${name}`,
        outdir,
        deps: [
          ...(option.deps ?? []),

          ...(option.bridgedProviders ?? []).map(
            eachBridgedProvider =>
              `@pulumi/${eachBridgedProvider.name}@file:sdks/${eachBridgedProvider.name}`,
          ),

          ...(option.commonDeps ?? []).map(
            eachCommonDep => `${eachCommonDep}@workspace:*`,
          ),
        ],
        devDeps: option.devDeps ?? [],
      }))(),
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
  bridgedProviders?: src.classes.BridgedProvider[];
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

  const outdir = path.join(
    src.constants.paths.dirs.infraDir,
    option.projectName,
  );
  const name = utils.functions.kebabCase(option.projectName);
  const project = new typescript.TypeScriptProject(
    _.mergeWith(
      {},
      sharedProjectOption,
      ((): TypeScriptProjectOptions => ({
        defaultReleaseBranch: src.constants.branches.main,
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
      }))(),
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
  if (!src.constants.isDevContainer) {
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
      workstationKubeconfig: process.env.KUBE_CONFIG_WORKSTATION_FILE_PATH,
      workstationIptimeDomain: process.env.WORKSTATION_DOMAIN_IPTIME,
      workstationIpV4Address,
      workstationPodsSubnetCidrBlock:
        process.env.WORKSTATION_BOOTSTRAP_KUBE_PODS_SUBNET_CIDR_BLOCK,
      workstationServicesSubnetCidrBlock:
        process.env.WORKSTATION_BOOTSTRAP_KUBE_SERVICE_SUBNET_CIDR_BLOCK,
      adapter: {
        sftp: {
          userName: process.env.WORKSTATION_SFTP_ADAPTER_USERNAME,
        },
      },
      istioNetwork: {
        meshId: process.env.ISTIO_MESH_ID,
        workstationClusterName: process.env.ISTIO_WORKSTATION_CLUSTER_NAME,
        workstationClusterNetwork:
          process.env.ISTIO_WORKSTATION_CLUSTER_NETWORK,
        workstationDirectGateway: {
          jellyfinSftpName:
            process.env.WORKSTATION_DIRECT_GATEWAY_JELLYFIN_SFTP_NAME,
          jellyfinSftpProtocol:
            process.env.WORKSTATION_DIRECT_GATEWAY_JELLYFIN_SFTP_PROTOCOL,
          jellyfinSftpPort: parseInt(
            process.env.WORKSTATION_DIRECT_GATEWAY_JELLYFIN_SFTP_PORT!!,
          ),
          qbittorrentSftpName:
            process.env.WORKSTATION_DIRECT_GATEWAY_QBITORRENT_SFTP_NAME,
          qbittorrentSftpProtocol:
            process.env.WORKSTATION_DIRECT_GATEWAY_QBITORRENT_SFTP_PROTOCOL,
          qbittorrentSftpPort: parseInt(
            process.env.WORKSTATION_DIRECT_GATEWAY_QBITORRENT_SFTP_PORT!!,
          ),
        },
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
      helmRepositoryUrls: src.constants.helmChartRepositoryUrls,
    },
    {
      prod: {},
    },
  );

  await Nexus.esc.ociEsc.upsertEsc(
    accountName,
    pulumiEscClient,
    {
      auth: 'ApiKey',
      fingerprint: process.env.APEX_CAPTAIN_OCI_FINGERPRINT,
      privateKey: process.env.APEX_CAPTAIN_OCI_PRIVATE_KEY!!.replace(
        /\\n/g,
        '\n',
      ),
      region: process.env.APEX_CAPTAIN_OCI_REGION,
      tenancyOcid: process.env.APEX_CAPTAIN_OCI_TENANCY_OCID,
      userOcid: process.env.APEX_CAPTAIN_OCI_USER_OCID,
    },
    {
      prod: {},
      dev: {},
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

  await Nexus.esc.k8sWorkstationSystemEsc.upsertEsc(
    accountName,
    pulumiEscClient,
    {
      longhorn: {
        nodes: [
          // Node 0
          {
            hostName: process.env.WORKSTATION_BOOTSTRAP_NODE_0_HOSTNAME,
            disks: [
              {
                name: process.env
                  .WORKSTATION_BOOTSTRAP_NODE_0_LONGHORN_DISK_0_NAME,
                path: process.env
                  .WORKSTATION_BOOTSTRAP_NODE_0_LONGHORN_DISK_0_MOUNTPATH,
                tags: [
                  process.env
                    .WORKSTATION_BOOTSTRAP_NODE_0_LONGHORN_DISK_0_DISKTYPE,
                ],
              },
              {
                name: process.env
                  .WORKSTATION_BOOTSTRAP_NODE_0_LONGHORN_DISK_1_NAME,
                path: process.env
                  .WORKSTATION_BOOTSTRAP_NODE_0_LONGHORN_DISK_1_MOUNTPATH,
                tags: [
                  process.env
                    .WORKSTATION_BOOTSTRAP_NODE_0_LONGHORN_DISK_1_DISKTYPE,
                ],
              },
            ],
          },
        ],
      },

      loadbalancer: {
        celium: {
          istioCrossNetworkTlsIp:
            process.env.WORKSTATION_SERVICE_LB_ISTIO_CROSS_NETWORK_TLS,
          ingressGatewayIp: process.env.WORKSTATION_SERVICE_LB_INGRESS,
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
      bridgedProviders: [src.constants.bridgedProviders.terraform.authentik],
    });

    const utilsProject = inflateCommonProject({
      projectName: 'utils',
      deps: ['zod'],
    });

    const customResourcesProject = inflateCommonProject({
      projectName: 'custom-resources',
      commonDeps: [utilsProject.project.package.packageName],
      deps: [
        src.constants.pulumiPackages.kubernetes,
        src.constants.pulumiPackages.command,
        src.constants.pulumiPackages.tls,
        src.constants.pulumiPackages.random,
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
        src.constants.pulumiPackages.escSdk,
        src.constants.pulumiPackages.std,
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
      deps: [src.constants.pulumiPackages.cloudflare],
      commonDeps: [
        commonProjects.utilsProject.project.package.packageName,
        commonProjects.nexusProject.project.package.packageName,
      ],
      esc: [Nexus.esc.commonEsc, Nexus.esc.cloudflareEsc],
    });

    const k8sWorkstationSystemProject = inflatePulumiProject({
      projectName: 'k8s-workstation-system',
      stages: [utils.enums.StackStage.PROD],
      deps: [
        src.constants.pulumiPackages.kubernetes,
        src.constants.pulumiPackages.oci,
      ],
      commonDeps: [
        commonProjects.bridgedProviderProject.project.package.packageName,
        commonProjects.utilsProject.project.package.packageName,
        commonProjects.customResourcesProject.project.package.packageName,
        commonProjects.nexusProject.project.package.packageName,
      ],
      infraDeps: [cloudflareProject.project.package.packageName],
      esc: [
        Nexus.esc.commonEsc,
        Nexus.esc.ociEsc,
        Nexus.esc.k8sWorkstationSystemEsc,
      ],
    });

    const k8sWorkstationToolsProject = inflatePulumiProject({
      projectName: 'k8s-workstation-tools',
      stages: [utils.enums.StackStage.PROD],
      deps: [src.constants.pulumiPackages.kubernetes, 'timezone-enum'],
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
      deps: [src.constants.pulumiPackages.kubernetes],
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
      esc: [Nexus.esc.commonEsc, Nexus.esc.k8sWorkstationAppsEsc],
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
    `"./${src.constants.paths.dirs.commonDir}/*"`,
    `"./${src.constants.paths.dirs.infraDir}/*"`,
  ].join(' --filter ');

  const infraPackageFilter = `"./${src.constants.paths.dirs.infraDir}/*"`;

  // Scripts & Tasks
  rootProject.defaultTask?.env('CI', '0');

  rootProject.defaultTask?.addSteps(
    {
      exec: `pnpm pulumi:install`,
    },
    {
      exec: 'pnpm i --no-frozen-lockfile',
    },
  );

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
        eslint: {},
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
    src.functions.flatley(
      {
        files: {
          associations: new src.classes.VsCodeObject({
            '.ToDo': 'markdown',
            '*.yaml.tpl': 'helm',
          }),
        },
        todohighlight: {
          toggleURI: true,
          isCaseSensitive: false,
          keywords: new src.classes.VsCodeObject([
            { text: '@' + 'ToDo', color: 'red', backgroundColor: 'black' },
            { text: '@' + 'Note', color: 'blue', backgroundColor: 'lightblue' },
            {
              text: '@' + 'Ref',
              color: 'green',
              backgroundColor: 'lightgreen',
            },
          ]),
          exclude: ['**/node_modules/**', '.vscode'],
        },
        workbench: {
          colorTheme: 'Tomorrow Night Blue',
        },
        'material-icon-theme': {
          files: {
            associations: new src.classes.VsCodeObject({
              '.projenrc.ts': 'controller',
              'index.ts': 'contributing',
              '*.enum.ts': 'scheme',
              '*.function.ts': 'fortran',
              '*.type.ts': 'toml',
              '*.esc.ts': 'key',
              '*.res.ts': 'scheme',
              '*.data.ts': 'scheme',
              '*.diagnosis.md': 'document',
              'contract.ts': 'bbx',
            }),
          },
          folders: {
            associations: new src.classes.VsCodeObject({
              crd: 'kubernetes',
              abstract: 'class',
              '.kube': 'kubernetes',
              workstation: 'home',
              '.projen': 'project',
              '.diagnosis': 'resource',
              ventoy: 'robot',
            }),
          },
        },
      },
      {
        safe: true,
        coercion: [
          {
            test: (__: string, value: any) => {
              return src.classes.VsCodeObject.isVscodeObject(value);
            },
            transform: (value: src.classes.VsCodeObject<any>) => value.object,
          },
        ],
      },
    ),
  );

  // pnpm-workspace.yaml file
  new YamlFile(rootProject, 'pnpm-workspace.yaml', {
    obj: {
      packages: [
        `${src.constants.paths.dirs.commonDir}/*`,
        `${src.constants.paths.dirs.infraDir}/*`,
      ],
      // Bridged Providers에 공통 네이밍 컨벤션이 있을 경우 Dynamic하게 설정될 수 있도록 변경
      allowBuilds: Object.fromEntries([
        ...Object.values(src.constants.bridgedProviders)
          .flatMap(eachBridgedProvider => Object.values(eachBridgedProvider))
          .map(eachBridgedProvider => [
            `@pulumi/${eachBridgedProvider.name}`,
            true,
          ]),
        ...src.constants.packagesAllowingBuildScripts.map(eachPackage => [
          eachPackage,
          true,
        ]),
      ]),
      overrides: {
        '@pulumi/pulumi': '$@pulumi/pulumi',
        '@types/node': '$@types/node',
        typescript: '$typescript',
        ...Object.fromEntries(
          Object.values(src.constants.bridgedProviders)
            .flatMap(eachBridgedProvider => Object.values(eachBridgedProvider))
            .flatMap(eachBridgedProvider =>
              eachBridgedProvider.packagesToOverride.map(eachPackage => [
                `@pulumi/${eachBridgedProvider.name}>${eachPackage}`,
                `$${eachPackage}`,
              ]),
            ),
        ),
      },
    },
  });

  // Nova Config File
  const novaConfigFile = new JsonFile(
    rootProject,
    src.constants.paths.files.novaConfigFile,
    {
      obj: {
        'poll-artifacthub': false,
        url: Object.values(src.constants.helmChartRepositoryUrls),
      },
    },
  );

  // Ventoy
  const ventoyWorkstationNodeUserDataTemplate = fs.readFileSync(
    path.join(
      rootProject.outdir,
      src.constants.paths.dirs.ventoyDir,
      'templates',
      'workstation-node.yaml.tpl',
    ),
    'utf-8',
  );

  const ventoyWorkstationNodeUserDataFilePath = path.join(
    rootProject.outdir,
    src.constants.paths.dirs.ventoyUserDataDir,
    'workstation-node.yaml',
  );

  if (src.constants.isDevContainer) {
    fs.writeFileSync(
      ventoyWorkstationNodeUserDataFilePath,
      Handlebars.compile(ventoyWorkstationNodeUserDataTemplate)({
        gatewayIp: process.env.WORKSTATION_BOOTSTRAP_GATEWAY_IP,
        nameServersAddresses: [
          process.env.WORKSTATION_BOOTSTRAP_NAMESERVER_ADDRESS_0,
          process.env.WORKSTATION_BOOTSTRAP_NAMESERVER_ADDRESS_1,
        ],
        hostname: process.env.WORKSTATION_BOOTSTRAP_TEMPORARY_HOST_NAME,
        userName: process.env.WORKSTATION_BOOTSTRAP_USERNAME,
        passwordHash: sha512.crypt(
          process.env.WORKSTATION_BOOTSTRAP_PASSWORD!!,
          `$6$rounds=4096$${randomBytes(8)
            .toString('base64')
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 16)}`,
        ),
        authorizedKeys: [process.env.WORKSTATION_BOOTSTRAP_SSH_PUBLIC_KEY],
        nodes: [
          {
            id: process.env.WORKSTATION_BOOTSTRAP_NODE_0_HOSTNAME,
            macAddress: process.env.WORKSTATION_BOOTSTRAP_NODE_0_MACADDRESS,
            addressCidr: `${process.env.WORKSTATION_BOOTSTRAP_NODE_0_STATIC_IP}/24`,
          },
        ],
        slackWebhookUrl: process.env.SLACK_WEBHOOK_URL_VENTOY_AUTO_INSTALL,
      }),
    );
  }

  const ubuntu2604LiveServerIsoPath = '/ubuntu-26.04-live-server-amd64.iso';
  const ventoyJsonFile = new JsonFile(
    rootProject,
    path.join(src.constants.paths.dirs.ventoyDir, 'ventoy.json'),
    {
      obj: {
        auto_install: [
          {
            image: ubuntu2604LiveServerIsoPath,
            template: `/${path.relative(rootProject.outdir, ventoyWorkstationNodeUserDataFilePath)}`,
            autosel: 1,
          },
        ],
        // @See https://www.ventoy.net/en/plugin_control.html
        control: [
          { VTOY_MENU_TIMEOUT: '5' },
          { VTOY_DEFAULT_IMAGE: ubuntu2604LiveServerIsoPath },
          { VTOY_SECONDARY_BOOT_MENU: '1' },
          { VTOY_SECONDARY_TIMEOUT: '5' },
        ],
      },
    },
  );

  // Readme File
  const readmeFile = new TextFile(rootProject, 'README.md', {
    lines: [
      '# Diagnosis',
      ...fs
        .readdirSync(src.constants.paths.dirs.diagnosisDir)
        .map(eachFileName => {
          return fs
            .readFileSync(
              path.join(src.constants.paths.dirs.diagnosisDir, eachFileName),
            )
            .toString();
        }),
    ],
  });

  // Husky
  src.functions.generateHuskyHooks({
    projectPath: rootProject.outdir,
    hooks: {
      'pre-commit': dedent`
        if ! command -v pnpm >/dev/null 2>&1; then
          exit 0
        fi

        pnpm projen
        pnpm eslint
        git add .
      `,

      'post-commit': dedent`
        git push
      `,
    },
  });

  // Requirements File
  const requirementsFile = new RequirementsFile(
    rootProject,
    'requirements.txt',
    {},
  );
  requirementsFile.addPackages(
    'ansible==11.13.0',
    'cryptography==46.0.7',
    'jmespath==1.1.0',
    'netaddr==1.3.0',
    'paramiko==3.5.1',
  );

  // Keys
  const workstationSshPrivateKey = new TextFile(
    rootProject,
    src.constants.paths.files.workstationSshPrivateKeyFile,
    {
      lines: process.env.WORKSTATION_BOOTSTRAP_SSH_PRIVATE_KEY
        ? process.env.WORKSTATION_BOOTSTRAP_SSH_PRIVATE_KEY.split('\\n')
        : [],
      committed: false,
      readonly: true,
    },
  );

  // Cursor
  const mcpJsonConfig: src.interfaces.CursorMcpConfig = {
    mcpServers: {
      context7: {
        url: 'https://mcp.context7.com/mcp',
        headers: {
          CONTEXT7_API_KEY: '${env:CONTEXT7_API_KEY}',
        },
      },
      'kubernetes-mcp-server': {
        command: 'npx',
        args: ['-y', 'kubernetes-mcp-server@latest'],
      },
    },
  };
  const mcpJsonFile = new JsonFile(
    rootProject,
    src.constants.paths.files.cursorMcpJsonFile,
    {
      obj: mcpJsonConfig,
    },
  );

  const workstationNode0Name =
    process.env.WORKSTATION_BOOTSTRAP_NODE_0_HOSTNAME;
  const ansibleWorkstationInventoryFile = new TextFile(
    rootProject,
    src.constants.paths.files.ansibleWorkstationInventoryFile,
    {
      lines: dedent`
        [all]
        ${workstationNode0Name}

        [kube_control_plane]
        ${workstationNode0Name}

        [etcd]
        ${workstationNode0Name}

        [kube_node]
        workstation-0
        
        [k8s_cluster:children]
        kube_control_plane
        kube_node
      `.split('\n'),
      committed: false,
      readonly: true,
    },
  );

  const generateKubesprayPlaybookScript = (playbook: string) => dedent`
    ANSIBLE_CONFIG=${src.constants.paths.dirs.ansibleThirdPartyDir}/kubespray/ansible.cfg \
    ansible-playbook -b -i \
      ${src.constants.paths.files.ansibleWorkstationInventoryFile} \
      ${src.constants.paths.dirs.ansibleThirdPartyDir}/kubespray/${playbook}.yml
  `;

  // Scripts
  rootProject.addScripts({
    'build:workspaces': `turbo run build --filter ${workspacePackageFilters}`,
    'build:infra': `turbo run build --filter ${infraPackageFilter}`,

    // ESLint
    posteslint: `turbo run eslint --filter ${workspacePackageFilters} --concurrency=3`,

    // Scripts
    'script:mergeKubeConfig': `ts-node scripts/merge-kube-config.script.ts`,
    'script:generateNovaDiagnosis': `ts-node scripts/generate-nova-diagnosis.script.ts`,
    'script:fetchWorkstationKubeconfig': `ts-node scripts/fetch-workstation-kubeconfig.script.ts`,

    // Pulumi
    'pulumi:preview': `turbo run pulumi:preview --filter ${infraPackageFilter}`,
    'pulumi:up': `turbo run pulumi:up --filter ${infraPackageFilter} --ui=tui`,
    'postpulumi:up': `pnpm script:mergeKubeConfig && pnpm script:generateNovaDiagnosis`,
    'pulumi:install': [
      ...commonProjectWithBridgedProviderOrder,
      ...pulumiProjectWithBridgedProviderOrder,
    ]
      .map(
        eachProject =>
          `pulumi install --no-dependencies --cwd ./${path.relative(rootProject.outdir, eachProject.outdir)}`,
      )
      .join(' && '),

    // Projen
    postprojen: 'pnpm build',
    postbuild: `turbo run build --filter ${workspacePackageFilters}`,
    postupgrade: `turbo run upgrade --filter ${workspacePackageFilters} --concurrency=1`,

    // Kubespray
    'kubespray:cluster': generateKubesprayPlaybookScript('cluster'),
    'kubespray:upgradeCluster':
      generateKubesprayPlaybookScript('upgrade-cluster'),

    // Ansible
    'ansible:preConfigure': dedent`
      cd ${src.constants.paths.dirs.ansibleDir}/workstation
      ansible-playbook pre-configure.yml
    `,

    // SSH
    ...Object.fromEntries(
      [0].map(eachNodeNumber => [
        `ssh:workstation:${eachNodeNumber}`,
        dedent`
        sshpass \
          -P "passphrase" \
          -p $WORKSTATION_BOOTSTRAP_SSH_PRIVATE_KEY_PASSPHRASE \
        ssh -o StrictHostKeyChecking=accept-new \
            -i ".keys/workstation.key" \
            -p "${`$WORKSTATION_BOOTSTRAP_NODE_${eachNodeNumber}_EXTERNAL_SSH_PORT`}" \
            $WORKSTATION_BOOTSTRAP_USERNAME@$WORKSTATION_DOMAIN_IPTIME
        `,
      ]),
    ),
  });

  rootProject.postSynthesize = async () => {
    if (src.constants.isDevContainer) {
      // Git Submodule Update
      execSync('git submodule update --init --recursive');
      // Python Dependencies Install
      const pythonInstallLog = execSync(
        `pip install -r ${path.relative(rootProject.outdir, requirementsFile.path)}`,
      ).toString();
      console.log(pythonInstallLog);
      // SSH Private Key Permission Change
      execSync(`chmod 400 ${workstationSshPrivateKey.path}`);
    }
  };

  rootProject.synth();
})();
