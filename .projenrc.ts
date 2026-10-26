import { execSync } from 'node:child_process';
import path from 'node:path';
import dedent from 'dedent';
import _ from 'lodash';
import { javascript, JsonFile, TextFile, typescript } from 'projen';
import { GithubCredentials } from 'projen/lib/github/github-credentials';
import { ArrowParens } from 'projen/lib/javascript';
import { RequirementsFile } from 'projen/lib/python';
import {
  TypeScriptProject,
  TypeScriptProjectOptions,
} from 'projen/lib/typescript';
import { VsCode } from 'projen/lib/vscode';
import * as NexusEsc from './common/nexus/src/esc';
import * as utils from './common/utils/src';
import { inflateCommonProject } from './projenrc/projects/common-projects';
import { inflatePulumiProject } from './projenrc/projects/pulumi-projects';
import { pinWorkflowActions } from './projenrc/workflows/action-pins';
import { addAutoMergeDevelopWorkflow } from './projenrc/workflows/auto-merge-develop';
import { addPrValidationWorkflow } from './projenrc/workflows/pr-validation';
import { modifyUpgradeWorkflow } from './projenrc/workflows/upgrade';
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
            axios: '$axios',
            'shell-quote': '1.12.0',
            'follow-redirects': '1.16.1',
            undici: '6.29.1',
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
        // rulesync는 메이저가 매일 바뀐다. 업그레이드는 docs/resolved/2026-10-17-ai-agent-config-rulesync.md 후속으로 수동 진행.
        exclude: ['rulesync'],
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

        // AI agent outputs — rulesync generate (SSOT: .rulesync/, .projenrc.ts)
        '/.cursor/rules/',
        '/.cursor/skills/',
        '/.cursor/mcp.json',
        '/.cursor/hooks.json',
        '/.claude/rules/',
        '/.claude/skills/',
        '/.claude/settings.json',
        '/.claude/settings.local.json',
        '/.mcp.json',
        '/.rulesync.local/',
        '/rulesync.local.jsonc',

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
        `/${src.constants.paths.dirs.reposDir}`,
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

        'rulesync@26.0.0',

        'concurrently',

        'lint-staged',
      ],
    }))(),
    utils.functions.mergeCustomizer,
  ),
);

void (async () => {
  await modifyUpgradeWorkflow(rootProject);
  addPrValidationWorkflow(rootProject);
  addAutoMergeDevelopWorkflow(rootProject);
  pinWorkflowActions(rootProject);

  // Common
  const commonProjects = (() => {
    const bridgedProviderProject = inflateCommonProject(
      rootProject,
      sharedProjectOption,
      commonProjectWithBridgedProviderOrder,
      {
        projectName: 'bridged-provider',
        bridgedProviders: [
          src.constants.bridgedProviders.terraform.authentik,
          src.constants.bridgedProviders.terraform.argocd,
          src.constants.bridgedProviders.terraform.coderd,
        ],
      },
    );

    const utilsProject = inflateCommonProject(
      rootProject,
      sharedProjectOption,
      commonProjectWithBridgedProviderOrder,
      {
        projectName: 'utils',
        deps: ['zod'],
        jest: true,
      },
    );

    const customResourcesProject = inflateCommonProject(
      rootProject,
      sharedProjectOption,
      commonProjectWithBridgedProviderOrder,
      {
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
          'axios@^1.20.0',
          'flat',
          '@kubernetes/client-node',
        ],
        devDeps: ['@types/ws'],
        jest: true,
      },
    );

    const nexusProject = inflateCommonProject(
      rootProject,
      sharedProjectOption,
      commonProjectWithBridgedProviderOrder,
      {
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
        jest: true,
      },
    );

    return {
      bridgedProviderProject,
      utilsProject,
      customResourcesProject,
      nexusProject,
    };
  })();

  // Pulumi Projects
  const pulumiProjects = (() => {
    const githubProject = inflatePulumiProject(
      rootProject,
      sharedProjectOption,
      pulumiProjectWithBridgedProviderOrder,
      {
        projectName: 'github',
        stages: [utils.enums.StackStage.PROD],
        deps: [src.constants.pulumiPackages.github],
        commonDeps: [
          commonProjects.utilsProject.project.package.packageName,
          commonProjects.nexusProject.project.package.packageName,
        ],
        esc: [NexusEsc.commonEsc, NexusEsc.githubEsc],
      },
    );

    const cloudflareProject = inflatePulumiProject(
      rootProject,
      sharedProjectOption,
      pulumiProjectWithBridgedProviderOrder,
      {
        projectName: 'cloudflare',
        stages: [utils.enums.StackStage.PROD],
        deps: [src.constants.pulumiPackages.cloudflare],
        commonDeps: [
          commonProjects.utilsProject.project.package.packageName,
          commonProjects.nexusProject.project.package.packageName,
        ],
        esc: [NexusEsc.commonEsc, NexusEsc.cloudflareEsc, NexusEsc.githubEsc],
      },
    );

    const k8sWorkstationSystemProject = inflatePulumiProject(
      rootProject,
      sharedProjectOption,
      pulumiProjectWithBridgedProviderOrder,
      {
        projectName: 'k8s-workstation-system',
        stages: [utils.enums.StackStage.PROD],
        deps: [
          src.constants.pulumiPackages.kubernetes,
          src.constants.pulumiPackages.command,
          src.constants.pulumiPackages.oci,
          src.constants.pulumiPackages.tls,
          src.constants.pulumiPackages.time,
          src.constants.pulumiPackages.vault,
          src.constants.pulumiPackages.github,
          src.constants.pulumiPackages.random,
          'cron-time-generator',
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
          githubProject.project.package.packageName,
        ],
        esc: [
          NexusEsc.commonEsc,
          NexusEsc.ociEsc,
          NexusEsc.k8sWorkstationSystemEsc,
          NexusEsc.githubEsc,
        ],
      },
    );

    const k8sWorkstationToolsProject = inflatePulumiProject(
      rootProject,
      sharedProjectOption,
      pulumiProjectWithBridgedProviderOrder,
      {
        projectName: 'k8s-workstation-tools',
        stages: [utils.enums.StackStage.PROD, utils.enums.StackStage.DEV],
        deps: [
          src.constants.pulumiPackages.cloudflare,
          src.constants.pulumiPackages.kubernetes,
          src.constants.pulumiPackages.vault,
          src.constants.pulumiPackages.random,
          'cron-time-generator',
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
        esc: [
          NexusEsc.commonEsc,
          NexusEsc.cloudflareEsc,
          NexusEsc.k8sWorkstationToolsEsc,
        ],
      },
    );

    const k8sWorkstationAppsProject = inflatePulumiProject(
      rootProject,
      sharedProjectOption,
      pulumiProjectWithBridgedProviderOrder,
      {
        projectName: 'k8s-workstation-apps',
        stages: [utils.enums.StackStage.PROD, utils.enums.StackStage.DEV],
        deps: [
          src.constants.pulumiPackages.kubernetes,
          src.constants.pulumiPackages.vault,
          'cron-time-generator',
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
        esc: [NexusEsc.commonEsc, NexusEsc.k8sWorkstationAppsEsc],
      },
    );

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

  // scripts/tsconfig.json — IDE picks nearest tsconfig; root include is src/ only.
  new JsonFile(
    rootProject,
    `${src.constants.paths.dirs.scriptDir}/tsconfig.json`,
    {
      obj: {
        extends: '../tsconfig.json',
        compilerOptions: {
          noEmit: true,
          rootDir: '..',
        },
        include: [
          '**/*.ts',
          `../${src.constants.paths.dirs.srcDir}/**/*.ts`,
          `../${src.constants.paths.dirs.commonDir}/nexus/src/**/*.ts`,
          `../${src.constants.paths.dirs.commonDir}/utils/src/**/*.ts`,
        ],
        exclude: ['node_modules'],
      },
    },
  );

  // Turbo.json file
  new JsonFile(rootProject, 'turbo.json', {
    obj: {
      $schema: 'https://turbo.build/schema.json',
      // AGENTS.md 자동 삽입 끔. 같은 안내는 .rulesync/rules/use-installed-turbo-docs.md
      agentGuidance: false,
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
          passThroughEnv: ['PULUMI_*', 'KUBECONFIG'],
        },
        'pulumi:up': {
          dependsOn: ['^build', 'build'],
          cache: false,
          interactive: true,
          passThroughEnv: ['PULUMI_*', 'KUBECONFIG'],
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
            '*.sh.tpl': 'shellscript',
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
          colorTheme: 'Monokai',
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
              '*.script.ts': 'coffee',
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
              diagnosis: 'resource',
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
              'Copilot IDE (VS Code Insiders)': false,
              'Copilot IDE (VSCodium)': false,
              'Copilot IDE (VSCodium Insiders)': false,
              'Claude Code': true,
              'Factory Droid CLI': false,
              'Cursor CLI': false,
              'Gemini CLI': false,
              'Codex CLI': false,
              'DeepSeek TUI': false,
              'Antigravity CLI': false,
              'Muse Code': false,
              Pi: false,
              'Qwen Code': false,
              'Grok Build': false,
              OpenCode: false,
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

  // // Readme File
  // const readmeFile = new TextFile(rootProject, 'README.md', {
  //   lines: [
  //     '# Diagnosis',
  //     ...fs
  //       .readdirSync(src.constants.paths.dirs.diagnosisDir)
  //       .map(eachFileName => {
  //         return fs
  //           .readFileSync(
  //             path.join(src.constants.paths.dirs.diagnosisDir, eachFileName),
  //           )
  //           .toString();
  //       }),
  //   ],
  // });

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
        protected=0
        while read -r local_ref local_sha remote_ref remote_sha; do
          case "$remote_ref" in
            refs/heads/main|refs/heads/develop)
              echo "pre-push: '$remote_ref' 직접 push 금지. feature 브랜치 → PR → develop → main 흐름을 쓰세요." >&2
              protected=1
              ;;
          esac
        done
        if [ "$protected" -eq 1 ]; then
          exit 1
        fi

        if ! command -v pnpm >/dev/null 2>&1; then
          exit 0
        fi

        # 로컬 빠른 게이트. 전량 진실은 PR Validate (build/test/eslint).
        pnpm test:workspaces
      `,

      'post-commit': dedent`
        branch="$(git rev-parse --abbrev-ref HEAD)"
        case "$branch" in
          main|develop)
            echo "post-commit: '$branch'에서는 자동 push 안 함 (ruleset). feature 브랜치에서 커밋하거나 pnpm script:openPullRequest 를 쓰세요."
            exit 0
            ;;
          HEAD)
            exit 0
            ;;
        esac
        git push -u origin HEAD
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
    'ansible==12.3.0',
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

  // AI Agents (rulesync) — rules·skills SSOT는 .rulesync/, MCP는 여기서 생성
  // Cursor: 서버는 컨테이너에서 돌지만 ${workspaceFolder}·env는 Windows 호스트에서 풀린다 → envFile로 컨테이너 env 전달
  // Claude Code: 컨테이너 안에서 실행, env 이미 존재, ${workspaceFolder} 모름 → 레포 루트 상대경로
  type AiAgentTarget = src.interfaces.RulesyncTarget;
  const toRepoPath = (target: AiAgentTarget, relativePath: string) =>
    target === 'cursor' ? `\${workspaceFolder}/${relativePath}` : relativePath;
  const remoteMcpProxyServer = (
    target: AiAgentTarget,
    url: string,
    proxyArgs: string[],
  ): src.interfaces.RulesyncStdioMcpServer => ({
    type: 'stdio',
    command: 'bash',
    args: [
      toRepoPath(
        target,
        `${src.constants.paths.dirs.scriptDir}/mcp-remote-proxy.sh`,
      ),
      url,
      ...proxyArgs,
    ],
    ...(target === 'cursor'
      ? { envFile: toRepoPath(target, '.devcontainer/.env') }
      : {}),
  });
  const targetMcpServers = (
    target: AiAgentTarget,
  ): src.interfaces.RulesyncMcpServers => ({
    'cloudflare-api': remoteMcpProxyServer(
      target,
      'https://mcp.cloudflare.com/mcp',
      ['Authorization', 'CLOUDFLARE_MCP_TOKEN', 'bearer'],
    ),
    // rulesync는 Cursor env 값의 ${workspaceFolder}를 ${env:workspaceFolder}로 바꾼다 → 래퍼 인자로 넘긴다
    'oracle-oci-cloud-mcp-server': {
      type: 'stdio',
      command: 'bash',
      args: [
        toRepoPath(target, `${src.constants.paths.dirs.scriptDir}/mcp-oci.sh`),
        ociConfigFile.path,
        apexCaptainOciProfile,
      ],
    },
    pulumi: remoteMcpProxyServer(target, 'https://mcp.ai.pulumi.com/mcp', [
      '--header',
      'Authorization',
      'PULUMI_ACCESS_TOKEN',
      'bearer',
      '--header',
      'X-Pulumi-Org',
      'PULUMI_APEX_CAPTAIN_ACCOUNT_NAME',
      'raw',
    ]),
  });
  const rulesyncMcpConfig: src.interfaces.RulesyncMcpConfig = {
    mcpServers: {
      'kubernetes-mcp-server': {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'kubernetes-mcp-server@latest'],
      },
    },
    cursor: { mcpServers: targetMcpServers('cursor') },
    claudecode: { mcpServers: targetMcpServers('claudecode') },
  };
  const rulesyncMcpFile = new JsonFile(
    rootProject,
    src.constants.paths.files.rulesyncMcpFile,
    {
      obj: rulesyncMcpConfig,
    },
  );

  const rulesyncConfig: src.interfaces.RulesyncConfig = {
    targets: {
      cursor: ['rules', 'mcp', 'skills', 'hooks'],
      claudecode: ['rules', 'mcp', 'skills', 'hooks'],
    },
    outputRoots: ['.'],
    delete: true,
  };
  const rulesyncConfigFile = new JsonFile(
    rootProject,
    src.constants.paths.files.rulesyncConfigFile,
    {
      obj: rulesyncConfig,
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
    'git:pr': `ts-node scripts/create-github-pr.script.ts --base develop`,
    'git:pr:to-main': `ts-node scripts/create-github-pr.script.ts --base main --head develop`,

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
    'script:openPullRequest': `ts-node scripts/open-pull-request.script.ts`,
    'script:promoteDevelopToMain': `ts-node scripts/promote-develop-to-main.script.ts`,
    'script:syncPulumiEsc': `ts-node scripts/sync-pulumi-esc.script.ts`,
    'script:generateVentoyUserData': `ts-node scripts/generate-ventoy-user-data.script.ts`,
    'script:bootstrapLocalEnv': `ts-node scripts/bootstrap-local-env.script.ts`,
    'script:synthProjectReadme': `ts-node scripts/synth-project-readme.script.ts`,

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

    // AI Agents (rulesync)
    'ai:generate': 'rulesync generate',
    'ai:check': 'rulesync generate --check',
    'ai:doctor': 'rulesync doctor',

    // Projen
    postprojen: 'pnpm ai:generate && pnpm build',
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
