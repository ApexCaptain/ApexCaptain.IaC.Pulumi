import fs from 'fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { LocalWorkspace } from '@pulumi/pulumi/automation';
import CronTime from 'cron-time-generator';
import dedent from 'dedent';
import _ from 'lodash';
import { javascript, JsonFile, TextFile, typescript, YamlFile } from 'projen';
import { GithubWorkflow } from 'projen/lib/github';
import { GithubCredentials } from 'projen/lib/github/github-credentials';
import { Job, JobPermission } from 'projen/lib/github/workflows-model';
import { ArrowParens } from 'projen/lib/javascript';
import { RequirementsFile } from 'projen/lib/python';
import {
  TypeScriptProject,
  TypeScriptProjectOptions,
} from 'projen/lib/typescript';
import { VsCode } from 'projen/lib/vscode';
import Timezone from 'timezone-enum';
import { AbstractEsc } from './common/nexus/src/abstract/esc.abstract';
import * as NexusEsc from './common/nexus/src/esc';
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
        tsconfigPath: './test/tsconfig.json',
        projectService: false,
        dirs: [src.constants.paths.dirs.srcDir],
        devdirs: [src.constants.paths.dirs.scriptDir],
        ignorePatterns: ['/**/node_modules/*', '/**/pnpm-store/*'],
        prettier: true,
      },
      projenrcTs: true,
      tsconfigDev: {
        include: [
          `../${src.constants.paths.dirs.srcDir}/**/*.ts`,
          `../${src.constants.paths.dirs.scriptDir}/**/*.ts`,
          '../common/**/test/**/*.ts',
          '../.projenrc.ts',
          '../projenrc/**/*.ts',
        ],
      },

      // Node Project Options
      pnpmOptions: {
        workspaceYamlOptions: {
          packages: [
            `${src.constants.paths.dirs.commonDir}/*`,
            `${src.constants.paths.dirs.infraDir}/*`,
          ],
          // Bridged Providers에 공통 네이밍 컨벤션이 있을 경우 Dynamic하게 설정될 수 있도록 변경
          allowBuilds: Object.fromEntries([
            ...Object.values(src.constants.bridgedProviders)
              .flatMap(eachBridgedProvider =>
                Object.values(eachBridgedProvider),
              )
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
            '@pulumi/esc-sdk': '$@pulumi/esc-sdk',
            typescript: '$typescript',
            ...Object.fromEntries(
              Object.values(src.constants.bridgedProviders)
                .flatMap(eachBridgedProvider =>
                  Object.values(eachBridgedProvider),
                )
                .flatMap(eachBridgedProvider =>
                  eachBridgedProvider.packagesToOverride.map(eachPackage => [
                    `@pulumi/${eachBridgedProvider.name}>${eachPackage}`,
                    `$${eachPackage}`,
                  ]),
                ),
            ),
          },
        },
      },
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
      pullRequestTemplate: true,
      pullRequestTemplateContents: [
        '## Related issues',
        '',
        '<!-- Closes #123 / Fixes #123 / Relates to #123. 이슈 없으면 이 섹션 전체 삭제 -->',
        '',
        'Fixes #',
        '',
        '## Summary',
        '',
        '<!-- Reviewer가 30초 안에 파악할 수 있도록: 무엇을, 왜 바꿨는지 (1~3 bullet) -->',
        '',
        '-',
        '',
        '## Test plan',
        '',
        '<!-- 검증 근거. 명령어, 스택, UI 확인, 스크린샷 링크 등 -->',
        '',
        '- [ ]',
        '',
        '## Deployment notes',
        '',
        '<!-- 대상 stack/환경, 배포 순서, 수동 후속 작업, 롤백. 해당 없으면 이 섹션 전체 삭제 (N/A 금지) -->',
        '',
        '## Checklist',
        '',
        '- [ ] Self-review 완료',
        '- [ ] Secret·credential·kubeconfig 등 민감 정보 미포함',
        '- [ ] `pulumi preview` 또는 관련 검증 실행 (해당 시)',
        '- [ ] 문서·주석·runbook 업데이트 (해당 시)',
        '',
        '## Additional notes',
        '',
        '<!-- 알려진 제한, 후속 PR, 스크린샷. 해당 없으면 이 섹션 전체 삭제 (N/A 금지) -->',
      ],
      projenCredentials: GithubCredentials.fromPersonalAccessToken({
        secret: 'WORKFLOW_TOKEN',
      }),
      authorName: src.constants.author.name,
      authorEmail: src.constants.author.email,
      name: src.constants.project.name,

      gitignore: [
        '.DS_STORE',
        'Pulumi*.yaml',
        'Pulumi*.yml',
        'inventory.ini',
        '.specstory',
        '.superpowers',
        'docs/superpowers',

        src.constants.paths.dirs.turboDir,
        src.constants.paths.dirs.tmpDir,
        `/${src.constants.paths.files.repomixOutputXmlFile}`,
        `/${src.constants.paths.dirs.githubGeneratedDir}`,
        `/${src.constants.paths.dirs.keysDir}`,
        `/${src.constants.paths.dirs.secretsDir}`,
        `/${src.constants.paths.dirs.kubeConfigDir}`,
        `/${src.constants.paths.dirs.pnpmStoreDir}`,
        `/${src.constants.paths.dirs.ventoyUserDataDir}`,
        `/${src.constants.paths.dirs.venvDir}`,
        `/${src.constants.paths.dirs.ociConfigDir}`,
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

        'repomix',

        '@cursor/sdk',

        'concurrently',

        'lint-staged',
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
  // @ToDo Timezone 설정 나온 지 3개월은 되었는데 Projen 이놈들 이거 언제 업데이트 해주려나? Issue 한 번 올려서 물어봐야 할 듯
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

/** PR 정적 검증 — 시크릿 없음. docs/issues/2026-09-11-pr-ci-validation-pipeline.md */
const addPrValidationWorkflow = () => {
  const gh = rootProject.github;
  if (!gh) return;

  const workflow = new GithubWorkflow(gh, 'pr-validation', {
    limitConcurrency: true,
    concurrencyOptions: {
      group:
        '${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}',
      cancelInProgress: true,
    },
    fileName: 'pr-validation.yml',
  });

  workflow.on({
    pullRequest: {
      branches: [src.constants.branches.main, src.constants.branches.develop],
    },
  });

  workflow.addJob('validate', {
    name: 'Validate',
    runsOn: ['ubuntu-latest'],
    permissions: {
      contents: JobPermission.READ,
    },
    steps: [
      {
        name: 'Checkout',
        uses: 'actions/checkout@v4',
      },
      {
        name: 'Setup pnpm',
        uses: 'pnpm/action-setup@v6.0.10',
        with: {
          version: '10.33.0',
        },
      },
      {
        name: 'Setup Node.js',
        uses: 'actions/setup-node@v4',
        with: {
          'node-version': '24',
          cache: 'pnpm',
        },
      },
      {
        name: 'Install dependencies',
        run: 'pnpm i --frozen-lockfile',
      },
      {
        name: 'Build workspaces',
        run: 'pnpm build:workspaces',
      },
      {
        name: 'Test workspaces',
        run: 'pnpm test:workspaces',
      },
      {
        name: 'ESLint',
        run: 'pnpm eslint',
      },
    ],
  });
};

const inflateCommonProject = (option: {
  projectName: string;
  deps?: string[];
  commonDeps?: string[];
  devDeps?: string[];
  bridgedProviders?: src.classes.BridgedProvider[];
  jest?: boolean;
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
        eslintOptions: {
          dirs: [src.constants.paths.dirs.srcDir],
          devdirs: option.jest
            ? [src.constants.paths.dirs.scriptDir, 'test']
            : [src.constants.paths.dirs.scriptDir],
          tsconfigPath: './test/tsconfig.json',
          projectService: false,
        },
        ...(option.jest
          ? {
              jest: true,
              jestOptions: {
                configFilePath: 'jest.config.json',
                jestConfig: {
                  testMatch: ['**/test/**/*.test.ts'],
                  passWithNoTests: true,
                  // default is cores-1; Pulumi/k8s test files otherwise saturate the box
                  maxWorkers: 2,
                } as javascript.JestConfigOptions,
              },
            }
          : { jest: false }),
        tsconfigDev: {
          include: [
            `../${src.constants.paths.dirs.srcDir}/**/*.ts`,
            `../${src.constants.paths.dirs.scriptDir}/**/*.ts`,
          ],
        },
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

  if (option.jest && project.jest) {
    // testMatch를 덮어쓰지 않으면 Projen이 기본 src/**, test/** 패턴을 붙인다.
    project.jest.config.testMatch = ['**/test/**/*.test.ts'];
    project.jest.config.maxWorkers = 2;
  }

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
  esc?: AbstractEsc<any>[];
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

  // PULUMI_REFRESH=1 설정 시 preview/up에 --refresh 추가 (루트: PULUMI_REFRESH=1 pnpm pulumi:up)
  project.addScripts({
    'pulumi:preview': `pulumi preview --stack \${PULUMI_STACK:-${utils.enums.StackStage.PROD}} \${PULUMI_REFRESH:+--refresh}`,
    'pulumi:up': `pulumi preview --stack \${PULUMI_STACK:-${utils.enums.StackStage.PROD}} \${PULUMI_REFRESH:+--refresh} --expect-no-changes || pulumi up --stack \${PULUMI_STACK:-${utils.enums.StackStage.PROD}} \${PULUMI_REFRESH:+--refresh}`,
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

void (async () => {
  await modifyUpgradeWorkflow();
  addPrValidationWorkflow();

  // Common
  const commonProjects = (() => {
    const bridgedProviderProject = inflateCommonProject({
      projectName: 'bridged-provider',
      bridgedProviders: [
        src.constants.bridgedProviders.terraform.authentik,
        src.constants.bridgedProviders.terraform.argocd,
        src.constants.bridgedProviders.terraform.coderd,
      ],
    });

    const utilsProject = inflateCommonProject({
      projectName: 'utils',
      deps: ['zod'],
      jest: true,
    });

    const customResourcesProject = inflateCommonProject({
      projectName: 'custom-resources',
      commonDeps: [
        utilsProject.project.package.packageName,
        bridgedProviderProject.project.package.packageName,
      ],
      deps: [
        src.constants.pulumiPackages.kubernetes,
        src.constants.pulumiPackages.command,
        src.constants.pulumiPackages.tls,
        src.constants.pulumiPackages.random,
        src.constants.pulumiPackages.vault,
        'axios',
        'flat',
        '@kubernetes/client-node',
      ],
      devDeps: ['@types/ws'],
      jest: true,
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
      esc: [NexusEsc.commonEsc, NexusEsc.cloudflareEsc, NexusEsc.githubEsc],
    });

    const k8sWorkstationSystemProject = inflatePulumiProject({
      projectName: 'k8s-workstation-system',
      stages: [utils.enums.StackStage.PROD],
      deps: [
        src.constants.pulumiPackages.kubernetes,
        src.constants.pulumiPackages.oci,
        src.constants.pulumiPackages.tls,
        src.constants.pulumiPackages.time,
        src.constants.pulumiPackages.vault,
        src.constants.pulumiPackages.github,
        src.constants.pulumiPackages.random,
      ],
      commonDeps: [
        commonProjects.bridgedProviderProject.project.package.packageName,
        commonProjects.utilsProject.project.package.packageName,
        commonProjects.customResourcesProject.project.package.packageName,
        commonProjects.nexusProject.project.package.packageName,
      ],
      infraDeps: [cloudflareProject.project.package.packageName],
      esc: [
        NexusEsc.commonEsc,
        NexusEsc.ociEsc,
        NexusEsc.k8sWorkstationSystemEsc,
        NexusEsc.githubEsc,
      ],
    });

    const k8sWorkstationToolsProject = inflatePulumiProject({
      projectName: 'k8s-workstation-tools',
      stages: [utils.enums.StackStage.PROD, utils.enums.StackStage.DEV],
      deps: [
        src.constants.pulumiPackages.kubernetes,
        src.constants.pulumiPackages.vault,
        src.constants.pulumiPackages.random,

        'timezone-enum',
      ],
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
      esc: [NexusEsc.commonEsc, NexusEsc.k8sWorkstationToolsEsc],
    });

    const k8sWorkstationAppsProject = inflatePulumiProject({
      projectName: 'k8s-workstation-apps',
      stages: [utils.enums.StackStage.PROD, utils.enums.StackStage.DEV],
      deps: [
        src.constants.pulumiPackages.kubernetes,
        src.constants.pulumiPackages.vault,
      ],
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
      esc: [NexusEsc.commonEsc, NexusEsc.k8sWorkstationAppsEsc],
    });

    return {
      cloudflareProject,
      k8sWorkstationSystemProject,
      k8sWorkstationToolsProject,
      k8sWorkstationAppsProject,
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
          dependsOn: ['^build'],
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
          colorTheme: 'Abyss',
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
        specstory: {
          cloudSync: {
            enabled: 'never',
          },
          providers: {
            enabled: new src.classes.VsCodeObject({
              'Cursor IDE': true,
              'Copilot IDE': false,
              'Claude Code': false,
              'Factory Droid CLI': false,
              'Cursor CLI': false,
              'Gemini CLI': false,
              'Codex CLI': false,
              'DeepSeek TUI': false,
              'Antigravity CLI': false,
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

  // Nova Config File
  const novaConfigFile = new JsonFile(
    rootProject,
    src.constants.paths.files.novaConfigFile,
    {
      obj: {
        'poll-artifacthub': true,
        url: Object.values(src.constants.helmChartRepositoryUrls).filter(
          eachUrl => !eachUrl.includes('oci://'),
        ),
      },
    },
  );

  // Ventoy
  const ubuntu2604LiveServerIsoPath = '/ubuntu-26.04-live-server-amd64.iso';
  const ventoyJsonFile = new JsonFile(
    rootProject,
    path.join(src.constants.paths.dirs.ventoyDir, 'ventoy.json'),
    {
      obj: {
        auto_install: [
          {
            image: ubuntu2604LiveServerIsoPath,
            template: `/${path.join(src.constants.paths.dirs.ventoyUserDataDir, 'workstation-node.yaml')}`,
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

  // lint-staged — staged TS only. Env must live in the hook: lint-staged does not expand shell env in commands.
  // cwd per nearest .eslintrc.json — root eslint would resolve ./test/tsconfig.json to the repo, not the package.
  rootProject.package.addField('lint-staged', {
    '**/*.{ts,tsx}':
      'ts-node --transpile-only scripts/lint-staged-eslint.script.ts',
  });

  // Husky
  src.functions.generateHuskyHooks({
    projectPath: rootProject.outdir,
    hooks: {
      'pre-commit': dedent`
        if ! command -v pnpm >/dev/null 2>&1; then
          exit 0
        fi

        export ESLINT_USE_FLAT_CONFIG=false
        export NODE_NO_WARNINGS=1
        pnpm exec lint-staged
      `,

      'pre-push': dedent`
        if ! command -v pnpm >/dev/null 2>&1; then
          exit 0
        fi

        pnpm test:workspaces
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
    'ansible==14.3.1',
    'cryptography==50.0.0',
    'jmespath==1.1.0',
    'netaddr==1.3.0',
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

  const ociApexCaptainSshPrivateKey = new TextFile(
    rootProject,
    src.constants.paths.files.ociApexCaptainSshPrivateKeyFile,
    {
      lines: process.env.APEX_CAPTAIN_OCI_PRIVATE_KEY
        ? process.env.APEX_CAPTAIN_OCI_PRIVATE_KEY.split('\\n')
        : [],
      committed: false,
      readonly: true,
    },
  );

  // OCI Config File
  const apexCaptainOciProfile = 'ApexCaptain';
  const ociConfigFile = new TextFile(
    rootProject,
    src.constants.paths.files.ociConfigFile,
    {
      lines: [
        `[${apexCaptainOciProfile}]`,
        `user=${process.env.APEX_CAPTAIN_OCI_USER_OCID}`,
        `fingerprint=${process.env.APEX_CAPTAIN_OCI_FINGERPRINT}`,
        `key_file=${ociApexCaptainSshPrivateKey.absolutePath}`,
        `tenancy=${process.env.APEX_CAPTAIN_OCI_TENANCY_OCID}`,
        `region=${process.env.APEX_CAPTAIN_OCI_REGION}`,
      ],
      editGitignore: false,
    },
  );

  // Repomix Config File
  const repomixConfigFile = new JsonFile(
    rootProject,
    src.constants.paths.files.repomixConfigJsonFile,
    {
      obj: {
        $schema: 'https://repomix.com/schemas/latest/schema.json',
        input: {
          maxFileSize: 52428800,
        },
        output: {
          filePath: src.constants.paths.files.repomixOutputXmlFile,
          style: 'xml',
          filePathStyle: 'target-relative',
          parsableStyle: false,
          fileSummary: true,
          directoryStructure: true,
          files: true,
          removeComments: false,
          removeEmptyLines: false,
          compress: false,
          topFilesLength: 5,
          showLineNumbers: false,
          truncateBase64: false,
          copyToClipboard: false,
          includeFullDirectoryStructure: false,
          tokenCountTree: false,
          git: {
            sortByChanges: true,
            sortByChangesMaxCommits: 100,
            includeDiffs: false,
            includeLogs: false,
            includeLogsCount: 50,
          },
        },
        include: [],
        ignore: {
          useGitignore: true,
          useDotIgnore: true,
          useDefaultPatterns: true,
          customPatterns: [
            // Agents
            '.agents',

            // Ansible Third Party
            src.constants.paths.dirs.ansibleThirdPartyDir,

            // Bridged Provider SDKs
            path.relative(
              rootProject.outdir,
              `${commonProjects.bridgedProviderProject.project.outdir}/sdks`,
            ),

            // Image Assets
            '**/*.png',
            '**/*.jpg',
            '**/*.jpeg',
            '**/*.svg',
            '**/*.ico',

            // Package Lock Files
            'pnpm-lock.yaml',
            'package-lock.json',
            'yarn.lock',
          ],
        },
        security: {
          enableSecurityCheck: true,
        },
        tokenCount: {
          encoding: 'o200k_base',
        },
      },
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
      'oracle-oci-cloud-mcp-server': {
        command: 'uvx',
        args: ['oracle.oci-cloud-mcp-server@latest'],
        env: {
          FASTMCP_LOG_LEVEL: 'ERROR',
          OCI_CONFIG_FILE: `\${workspaceFolder}/${ociConfigFile.path}`,
          OCI_CONFIG_PROFILE: apexCaptainOciProfile,
        },
      },
      pulumi: {
        url: 'https://mcp.ai.pulumi.com/mcp',
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

  const cursorSettingsConfig: src.interfaces.CursorSettings = {
    plugins: {
      superpowers: {
        enabled: true,
      },
      orchestrate: {
        enabled: true,
      },
      thermos: {
        enabled: true,
      },
      'continual-learning': {
        enabled: true,
      },
      'docs-canvas': {
        enabled: true,
      },
      'pr-review-canvas': {
        enabled: true,
      },
    },
  };
  const cursorSettingsFile = new JsonFile(
    rootProject,
    src.constants.paths.files.cursorSettingsJsonFile,
    {
      obj: cursorSettingsConfig,
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
    'git:commit': `git commit -F ${src.constants.paths.files.githubGeneratedCommitMessageFile}`,
    'git:pr': dedent`
        gh pr create \
          --title "$(cat ${src.constants.paths.files.githubGeneratedPullRequestTitleFile})" \
          --body-file "${src.constants.paths.files.githubGeneratedPullRequestBodyFile}"`,

    'build:workspaces': `turbo run build --filter ${workspacePackageFilters}`,
    posttest: 'pnpm test:workspaces',
    'test:workspaces': `turbo run test --filter ${workspacePackageFilters} --concurrency=2`,
    'build:infra': `turbo run build --filter ${infraPackageFilter}`,

    // ESLint
    posteslint: `turbo run eslint --filter ${workspacePackageFilters} --concurrency=3`,

    // Scripts
    'script:mergeKubeConfig': `ts-node scripts/merge-kube-config.script.ts`,
    'script:generateNovaDiagnosis': `ts-node scripts/generate-nova-diagnosis.script.ts`,
    'script:generatePlutoDiagnosis': `ts-node scripts/generate-pluto-diagnosis.script.ts`,
    'script:fetchWorkstationKubeconfig': `ts-node scripts/fetch-workstation-kubeconfig.script.ts`,
    'script:generateCommitMessage': `ts-node scripts/generate-commit-message.script.ts`,
    'script:generatePullRequest': `ts-node scripts/generate-pull-request.script.ts`,
    'script:syncPulumiEsc': `ts-node scripts/sync-pulumi-esc.script.ts`,
    'script:generateVentoyUserData': `ts-node scripts/generate-ventoy-user-data.script.ts`,
    'script:bootstrapLocalEnv': `ts-node scripts/bootstrap-local-env.script.ts`,

    // Pulumi — refresh는 PULUMI_REFRESH=1 로 선택 (기본 off)
    'pulumi:preview': `turbo run pulumi:preview --filter ${infraPackageFilter}`,
    'pulumi:up': `turbo run pulumi:up --filter ${infraPackageFilter} --ui=tui`,
    'postpulumi:up': dedent`
      pnpm script:mergeKubeConfig && \
      concurrently --kill-others-on-fail \
        "pnpm script:generateNovaDiagnosis" \
        "pnpm script:generatePlutoDiagnosis"
    `,
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
    'ansible:postConfigure': dedent`
      cd ${src.constants.paths.dirs.ansibleDir}/workstation
      ansible-playbook post-configure.yml
    `,

    // SSH
    ...Object.fromEntries(
      [0].map(eachNodeNumber => [
        `ssh:workstation:${eachNodeNumber}`,
        dedent`
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
      [workstationSshPrivateKey, ociApexCaptainSshPrivateKey].forEach(eachKey =>
        execSync(`chmod 400 ${eachKey.path}`),
      );
      execSync(`chmod 600 ${ociConfigFile.path}`);
    }
  };

  rootProject.synth();
})();
