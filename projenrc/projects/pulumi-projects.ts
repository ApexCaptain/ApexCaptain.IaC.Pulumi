import path from 'node:path';
import { LocalWorkspace } from '@pulumi/pulumi/automation';
import _ from 'lodash';
import { JsonFile, typescript, YamlFile } from 'projen';
import {
  TypeScriptProject,
  TypeScriptProjectOptions,
} from 'projen/lib/typescript';
import { AbstractEsc } from '../../common/nexus/src/abstract/esc.abstract';
import * as utils from '../../common/utils/src';
import * as src from '../../src';

export function inflatePulumiProject(
  rootProject: typescript.TypeScriptProject,
  sharedProjectOption: Partial<TypeScriptProjectOptions>,
  pulumiProjectWithBridgedProviderOrder: TypeScriptProject[],
  option: {
    projectName: string;
    stages: utils.enums.StackStage[];
    description?: string;
    commonDeps?: string[];
    infraDeps?: string[];
    deps?: string[];
    devDeps?: string[];
    esc?: AbstractEsc<any>[];
    bridgedProviders?: src.classes.BridgedProvider[];
  },
) {
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
}
