import fs from 'node:fs';
import path from 'node:path';
import { Agent } from '@cursor/sdk';
import chalk from 'chalk';
import dedent from 'dedent';
import * as src from '../src';
import {
  buildPackageDocsContext,
  buildRootDocsContext,
  buildPackageManifest,
  buildRootManifest,
  checkSecretLeak,
  cleanMarkdownCodeFence,
  listWorkspacePackages,
  loadProjectReadmeRules,
  type PackageReadmeManifest,
  type RootReadmeManifest,
  type WorkspacePackage,
} from './common';

type SynthTarget =
  { kind: 'root' } | { kind: 'package'; pkg: WorkspacePackage };

const FORBIDDEN_APPLY_PATHS = ['common/bridged-provider/sdks/'] as const;

function parseArgs(): {
  apply: boolean;
  allWorkspace: boolean;
  packagePath?: string;
} {
  const argv = process.argv.slice(2);
  let apply = false;
  let allWorkspace = false;
  let packagePath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--all-workspace') {
      allWorkspace = true;
      continue;
    }
    if (arg === '--package') {
      packagePath = argv[i + 1]?.replace(/\\/g, '/');
      i += 1;
      continue;
    }
    if (arg.startsWith('--package=')) {
      packagePath = arg.slice('--package='.length).replace(/\\/g, '/');
    }
  }

  return { apply, allWorkspace, packagePath };
}

function resolveTargets(
  packages: WorkspacePackage[],
  options: ReturnType<typeof parseArgs>,
): SynthTarget[] {
  if (options.packagePath) {
    const normalized = options.packagePath.replace(/^\.\//, '');
    const pkg = packages.find(p => p.relativePath === normalized);
    if (!pkg) {
      throw new Error(
        `workspace 패키지를 찾을 수 없습니다: ${normalized} (예: common/utils)`,
      );
    }
    return [{ kind: 'package', pkg }];
  }

  if (options.allWorkspace) {
    return [
      { kind: 'root' },
      ...packages.map(pkg => ({ kind: 'package' as const, pkg })),
    ];
  }

  return [{ kind: 'root' }];
}

function generatedReadmePath(target: SynthTarget): string {
  const baseDir = src.constants.paths.dirs.githubGeneratedReadmeDir;
  if (target.kind === 'root') {
    return path.join(baseDir, 'ROOT.md');
  }
  return path.join(baseDir, `${target.pkg.relativePath}.md`);
}

function destinationReadmePath(target: SynthTarget): string {
  if (target.kind === 'root') {
    return 'README.md';
  }
  return path.join(target.pkg.relativePath, 'README.md');
}

function assertSafeApplyPath(relativePath: string): void {
  const normalized = relativePath.replace(/\\/g, '/');
  if (
    FORBIDDEN_APPLY_PATHS.some(prefix => normalized.includes(prefix)) ||
    normalized.includes('/sdks/')
  ) {
    throw new Error(`README apply 금지 경로: ${relativePath}`);
  }
}

function fixedSectionsPackage(manifest: PackageReadmeManifest): string {
  return dedent`
    ## 구조

    ${manifest.structureSection}

    ## 의존성

    ${manifest.dependenciesSection}

    ## 명령

    ${manifest.commandsSection}
  `;
}

function buildPackagePrompt(
  manifest: PackageReadmeManifest,
  docsContext: string,
  rulesContent: string,
): string {
  const components =
    manifest.componentDirs.length > 0
      ? manifest.componentDirs.map(name => `- ${name}`).join('\n')
      : '(components 디렉터리 없음)';

  return dedent`
    아래 manifest와 규칙에 따라 **패키지 README.md 전문**을 작성하세요.

    [지침 및 규칙]
    ${rulesContent}

    [Package Manifest]
    ${JSON.stringify(manifest, null, 2)}

    [src/components 하위 디렉터리]
    ${components}

    [contract.ts 발췌]
    ${manifest.contractExcerpt}

    [index.ts 발췌]
    ${manifest.indexExcerpt}

    [Docs 컨텍스트]
    ${docsContext}

    [고정 섹션 — README에 반드시 동일하게 포함]
    ${fixedSectionsPackage(manifest)}
  `;
}

function buildRootPrompt(
  manifest: RootReadmeManifest,
  docsContext: string,
  rulesContent: string,
): string {
  const packageTable = manifest.workspacePackages
    .map(
      p =>
        `| \`${p.relativePath}\` | \`${p.packageName}\` | ${p.isInfra ? 'infra' : 'common'} |`,
    )
    .join('\n');

  return dedent`
    아래 manifest와 규칙에 따라 **루트 README.md 전문**을 작성하세요.

    [지침 및 규칙]
    ${rulesContent}

    [Root Manifest]
    ${JSON.stringify(manifest, null, 2)}

    [Workspace 패키지 표 초안]
    | 경로 | 패키지 | 계층 |
    | --- | --- | --- |
    ${packageTable}

    [대표 루트 스크립트]
    ${manifest.rootScriptsSection}

    [Infra 배포 순서]
    \`\`\`
    ${manifest.deployOrderSection}
    \`\`\`

    [Docs 컨텍스트]
    ${docsContext}
  `;
}

function validateReadmeContent(content: string): void {
  const trimmed = content.trim();
  if (!trimmed.startsWith('#')) {
    throw new Error('README는 # 제목으로 시작해야 합니다.');
  }
  if (trimmed === '# replace this') {
    throw new Error('placeholder README가 생성되었습니다.');
  }
}

async function synthesizeReadme(
  target: SynthTarget,
  apiKey: string,
  modelId: string,
  rulesContent: string,
): Promise<string> {
  const packages = listWorkspacePackages();
  let prompt: string;

  if (target.kind === 'root') {
    const manifest = buildRootManifest(packages);
    const docsContext = buildRootDocsContext();
    prompt = buildRootPrompt(manifest, docsContext, rulesContent);
  } else {
    const manifest = buildPackageManifest(target.pkg);
    const docsContext = buildPackageDocsContext(
      target.pkg.relativePath,
      target.pkg.packageName,
    );
    prompt = buildPackagePrompt(manifest, docsContext, rulesContent);
  }

  checkSecretLeak('', prompt);

  console.log(
    chalk.blue(
      `Cursor SDK(${modelId}) — ${target.kind === 'root' ? '루트' : target.pkg.relativePath} README 합성 중...`,
    ),
  );

  const result = await Agent.prompt(prompt, {
    apiKey,
    model: { id: modelId },
  });

  if (result.status !== 'finished' || !result.result) {
    throw new Error(`README 합성 실패 (상태: ${result.status})`);
  }

  const readme = cleanMarkdownCodeFence(result.result, 'markdown').trim();
  validateReadmeContent(readme);
  return `${readme}\n`;
}

function writeGenerated(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

function applyReadme(target: SynthTarget, content: string): void {
  const dest = destinationReadmePath(target);
  assertSafeApplyPath(dest);
  fs.writeFileSync(dest, content, 'utf-8');
  console.log(chalk.green(`✓ 적용: ${dest}`));
}

async function main(): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error(
      chalk.red('[오류] CURSOR_API_KEY 환경변수가 설정되어 있지 않습니다.'),
    );
    process.exit(1);
  }

  const modelId = process.env.CURSOR_SYNTH_PROJECT_README_AI_MODEL;
  if (!modelId) {
    console.error(
      chalk.red(
        '[오류] CURSOR_SYNTH_PROJECT_README_AI_MODEL 환경변수가 설정되어 있지 않습니다.',
      ),
    );
    process.exit(1);
  }

  const options = parseArgs();
  const packages = listWorkspacePackages();
  const targets = resolveTargets(packages, options);
  const rulesContent = loadProjectReadmeRules();

  for (const target of targets) {
    const content = await synthesizeReadme(
      target,
      apiKey,
      modelId,
      rulesContent,
    );
    const outPath = generatedReadmePath(target);
    writeGenerated(outPath, content);
    console.log(chalk.green(`✓ 생성: ${outPath}`));

    if (options.apply) {
      applyReadme(target, content);
    }
  }

  if (!options.apply) {
    console.log(
      chalk.gray(
        '\n실제 README.md에 반영하려면 동일 명령에 --apply 를 추가하세요.',
      ),
    );
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`[오류] ${message}`));
  process.exit(1);
});
