import path from 'node:path';
import * as pulumiEscSdk from '@pulumi/esc-sdk';
import { LocalWorkspace } from '@pulumi/pulumi/automation';
import _ from 'lodash';
import { javascript, JsonFile, typescript, YamlFile } from 'projen';
import { GithubCredentials } from 'projen/lib/github/github-credentials';
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
  const kubeConfigDir = process.env.KUBE_CONFIG_DIR_NAME!!;
  const commonDir = 'common';
  const secretsDir = process.env.SECRETS_DIR_NAME!!;
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
      // local: new utils.classes.TerraformBridgedProvider({
      //   name: 'local',
      //   providerSource: 'hashicorp/local',
      //   providerVersion: '2.9.0',
      // }),
    },
  };

  return {
    project,
    author,
    branches,
    paths,
    projenCredentials,
    isDevContainer,
    bridgedProviders,
  };
})();

const commonProjectOrder: TypeScriptProject[] = [];
const pulumiProjectOrder: TypeScriptProject[] = [];

const sharedProjectOption: Partial<TypeScriptProjectOptions> = {
  tsconfig: {
    compilerOptions: {
      noUnusedLocals: false,
      noUnusedParameters: false,
    },
  },
  deps: ['@pulumi/pulumi', 'lodash', 'yaml'],
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
        'sdks',
        constants.paths.dirs.turboDir,
        constants.paths.dirs.tmpDir,

        `/${constants.paths.dirs.secretsDir}`,
        `/${constants.paths.dirs.kubeConfigDir}`,
        `/${constants.paths.dirs.pnpmStoreDir}`,
      ],
      deps: ['@pulumi/esc-sdk'],
      devDeps: ['lodash', '@types/lodash', 'dedent', 'turbo'],
    },
    utils.functions.mergeCustomizer,
  ),
);

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

  commonProjectOrder.push(project);

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

  return { project, pulumiYamlFile };
};

const inflatePulumiProject = (option: {
  projectName: string;
  stages: utils.enums.StackStage[];
  description?: string;
  commonDeps?: string[];
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

          ...(option.commonDeps ?? []).map(
            eachCommonDep => `${eachCommonDep}@workspace:*`,
          ),
        ],
        devDeps: option.devDeps ?? [],
      },
      utils.functions.mergeCustomizer,
    ),
  );

  pulumiProjectOrder.push(project);

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
    'pulumi:up': `pulumi preview --stack \${PULUMI_STACK:-${utils.enums.StackStage.PROD}} --expect-no-changes > /dev/null 2>&1 || pulumi up --stack \${PULUMI_STACK:-${utils.enums.StackStage.PROD}}`,
  });

  const infraDeps = [
    ...(option.commonDeps ?? []),
    ...(option.deps ?? []),
  ].filter(eachDep => eachDep.startsWith('@infra/'));

  if (infraDeps.length > 0) {
    new JsonFile(project, 'turbo.json', {
      obj: {
        $schema: 'https://turbo.build/schema.json',
        extends: ['//'],
        tasks: {
          'pulumi:preview': {
            dependsOn: [
              '^build',
              'build',
              ...infraDeps.map(
                eachInfraDep => `${eachInfraDep}#pulumi:preview`,
              ),
            ],
          },
          'pulumi:up': {
            dependsOn: [
              '^build',
              'build',
              ...infraDeps.map(eachInfraDep => `${eachInfraDep}#pulumi:up`),
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
      kubeConfig: {
        fileDirPath: process.env.KUBE_CONFIG_DIR_PATH,
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
        },
      },
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
      dev: {},
    },
  );
};

void (async () => {
  // Common
  const commonProjects = (() => {
    const utilsProject = inflateCommonProject({
      projectName: 'utils',
      deps: ['flatley', 'flat', 'axios', 'semver', 'chalk'],
      devDeps: ['@types/semver'],
    });
    const nexusProject = inflateCommonProject({
      projectName: 'nexus',
      commonDeps: [utilsProject.project.package.packageName],
      deps: ['@pulumi/esc-sdk', '@pulumi/command', 'zod'],
      bridgedProviders: [],
    });

    return {
      utils: utilsProject,
      nexus: nexusProject,
    };
  })();

  // Init Pulumi ESC
  await initPulumiEsc();

  // Pulumi Projects
  const pulumiProjects = (() => {
    const cloudflareProject = inflatePulumiProject({
      projectName: 'cloudflare',
      stages: [utils.enums.StackStage.PROD],
      deps: ['@pulumi/cloudflare'],
      commonDeps: [
        commonProjects.utils.project.package.packageName,
        commonProjects.nexus.project.package.packageName,
      ],
      esc: [Nexus.esc.commonEsc, Nexus.esc.cloudflareEsc],
    });

    const k8sWorkstationSystemProject = inflatePulumiProject({
      projectName: 'k8s-workstation-system',
      stages: [utils.enums.StackStage.PROD],
      deps: ['@pulumi/kubernetes'],
      commonDeps: [
        commonProjects.utils.project.package.packageName,
        commonProjects.nexus.project.package.packageName,
      ],
      esc: [Nexus.esc.k8sWorkstationSystemEsc],
    });

    return {
      k8sWorkstationSystem: k8sWorkstationSystemProject,
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
    preprojen: 'pnpm approve-builds --all',
    'build:workspaces': `turbo run build --filter ${workspacePackageFilters}`,
    'build:infra': `turbo run build --filter ${infraPackageFilter}`,

    'pulumi:preview': `turbo run pulumi:preview --filter ${infraPackageFilter}`,
    'pulumi:up': `turbo run pulumi:up --filter ${infraPackageFilter} --ui=tui`,
    'postpulumi:up': `ts-node scripts/merge-kube-config.script.ts`,
    'pulumi:install': [...commonProjectOrder, ...pulumiProjectOrder]
      .flatMap(
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
              'contract.ts': 'bbx',
            }),
          },
          folders: {
            associations: new utils.classes.VsCodeObject({
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
            test: (__, value) => {
              return utils.classes.VsCodeObject.isVscodeObject(value);
            },
            transform: (value: utils.classes.VsCodeObject<any>) => value.object,
          },
        ],
      },
    ),
  );

  // pnpm-workspace.yaml file
  new YamlFile(rootProject, 'pnpm-workspace.yaml', {
    obj: {
      packages: [
        `${constants.paths.dirs.commonDir}/*`,
        `${constants.paths.dirs.infraDir}/*`,
      ],
      // Bridged Providers에 공통 네이밍 컨벤션이 있을 경우 Dynamic하게 설정될 수 있도록 변경
      allowBuilds: {},
    },
  });

  rootProject.synth();
})();
