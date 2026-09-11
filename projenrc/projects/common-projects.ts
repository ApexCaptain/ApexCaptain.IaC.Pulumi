import path from 'node:path';
import _ from 'lodash';
import { javascript, typescript, YamlFile } from 'projen';
import {
  TypeScriptProject,
  TypeScriptProjectOptions,
} from 'projen/lib/typescript';
import * as utils from '../../common/utils/src';
import * as src from '../../src';

export function inflateCommonProject(
  rootProject: typescript.TypeScriptProject,
  sharedProjectOption: Partial<TypeScriptProjectOptions>,
  commonProjectWithBridgedProviderOrder: TypeScriptProject[],
  option: {
    projectName: string;
    deps?: string[];
    commonDeps?: string[];
    devDeps?: string[];
    bridgedProviders?: src.classes.BridgedProvider[];
    jest?: boolean;
  },
) {
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
    new YamlFile(project, 'Pulumi.yaml', {
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
}
