import fs from 'node:fs';
import path from 'node:path';

const CONTRACT_EXCERPT_MAX_CHARS = 6_000;
const INDEX_EXCERPT_MAX_CHARS = 2_000;
const MAX_TREE_ENTRIES = 48;

export type WorkspacePackage = {
  relativePath: string;
  packageName: string;
  isInfra: boolean;
};

export type PackageReadmeManifest = {
  kind: 'package';
  relativePath: string;
  packageName: string;
  isInfra: boolean;
  existingReadmeNote: string;
  componentDirs: string[];
  contractExcerpt: string;
  indexExcerpt: string;
  structureSection: string;
  dependenciesSection: string;
  commandsSection: string;
};

export type RootReadmeManifest = {
  kind: 'root';
  projectName: string;
  workspacePackages: Array<{
    relativePath: string;
    packageName: string;
    isInfra: boolean;
  }>;
  rootScriptsSection: string;
  deployOrderSection: string;
  existingReadmeNote: string;
};

function readExcerpt(filePath: string, maxChars: number): string {
  if (!fs.existsSync(filePath)) {
    return '(파일 없음)';
  }
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (!raw) {
    return '(비어 있음)';
  }
  if (raw.length <= maxChars) {
    return raw;
  }
  return `${raw.slice(0, maxChars)}\n… (이하 생략)`;
}

function listWorkspacePackageJsonPaths(): string[] {
  const patterns = ['common', 'infra'].flatMap(layer =>
    fs
      .readdirSync(path.join(process.cwd(), layer), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(layer, entry.name, 'package.json')),
  );
  return patterns.filter(relative => fs.existsSync(relative));
}

export function listWorkspacePackages(): WorkspacePackage[] {
  return listWorkspacePackageJsonPaths()
    .map(relativeJson => {
      const relativePath = path.dirname(relativeJson);
      const pkg = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), relativeJson), 'utf-8'),
      ) as { name?: string };
      const packageName = pkg.name ?? relativePath;
      return {
        relativePath: relativePath.replace(/\\/g, '/'),
        packageName,
        isInfra: relativePath.startsWith('infra/'),
      };
    })
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function walkSrcTree(
  dir: string,
  prefix: string,
  depth: number,
  lines: string[],
  budget: { remaining: number },
): void {
  if (budget.remaining <= 0 || depth > 3) {
    return;
  }
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (budget.remaining <= 0) {
      lines.push(`${prefix}…`);
      return;
    }
    const line = `${prefix}${entry.name}${entry.isDirectory() ? '/' : ''}`;
    lines.push(line);
    budget.remaining -= 1;
    if (entry.isDirectory()) {
      walkSrcTree(
        path.join(dir, entry.name),
        `${prefix}  `,
        depth + 1,
        lines,
        budget,
      );
    }
  }
}

function buildStructureSection(packageRoot: string): string {
  const srcDir = path.join(packageRoot, 'src');
  if (!fs.existsSync(srcDir)) {
    return '`(src 없음)`';
  }
  const lines: string[] = ['```', 'src/'];
  walkSrcTree(srcDir, '└── ', 0, lines, { remaining: MAX_TREE_ENTRIES });
  lines.push('```');
  return lines.join('\n');
}

function listComponentDirs(packageRoot: string): string[] {
  const componentsDir = path.join(packageRoot, 'src', 'components');
  if (!fs.existsSync(componentsDir)) {
    return [];
  }
  return fs
    .readdirSync(componentsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

function buildDependenciesSection(
  packageJson: Record<string, unknown>,
): string {
  const deps = packageJson.dependencies as Record<string, string> | undefined;
  if (!deps) {
    return '- (dependencies 없음)';
  }
  const lines = Object.keys(deps)
    .sort()
    .map(name => `- \`${name}\`${deps[name] ? ` (${deps[name]})` : ''}`);
  return lines.join('\n') || '- (dependencies 없음)';
}

const PACKAGE_SCRIPT_ORDER = [
  'build',
  'eslint',
  'test',
  'pulumi:preview',
  'pulumi:up',
] as const;

function buildCommandsSection(
  packageName: string,
  packageJson: Record<string, unknown>,
): string {
  const scripts = packageJson.scripts as Record<string, string> | undefined;
  const lines: string[] = [];
  for (const key of PACKAGE_SCRIPT_ORDER) {
    if (scripts?.[key]) {
      lines.push(`pnpm --filter ${packageName} ${key}`);
    }
  }
  if (!lines.length) {
    lines.push(`pnpm --filter ${packageName} build`);
  }
  return ['```bash', ...lines, '```'].join('\n');
}

function existingReadmeNote(readmePath: string): string {
  if (!fs.existsSync(readmePath)) {
    return '기존 README 없음';
  }
  const content = fs.readFileSync(readmePath, 'utf-8').trim();
  if (!content || content === '# replace this') {
    return 'placeholder README (`# replace this`) — 새로 작성';
  }
  return `기존 README ${content.length}자 (참고만, manifest·코드가 우선)`;
}

export function buildPackageManifest(
  pkg: WorkspacePackage,
): PackageReadmeManifest {
  const packageRoot = path.join(process.cwd(), pkg.relativePath);
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8'),
  ) as Record<string, unknown>;

  const contractPath = path.join(packageRoot, 'src', 'contract.ts');
  const indexPath = path.join(packageRoot, 'src', 'index.ts');

  return {
    kind: 'package',
    relativePath: pkg.relativePath,
    packageName: pkg.packageName,
    isInfra: pkg.isInfra,
    existingReadmeNote: existingReadmeNote(path.join(packageRoot, 'README.md')),
    componentDirs: listComponentDirs(packageRoot),
    contractExcerpt: readExcerpt(contractPath, CONTRACT_EXCERPT_MAX_CHARS),
    indexExcerpt: readExcerpt(indexPath, INDEX_EXCERPT_MAX_CHARS),
    structureSection: buildStructureSection(packageRoot),
    dependenciesSection: buildDependenciesSection(packageJson),
    commandsSection: buildCommandsSection(pkg.packageName, packageJson),
  };
}

const ROOT_SCRIPT_PREFIXES = [
  'build:',
  'pulumi:',
  'script:',
  'git:',
  'test:',
  'postpulumi:',
] as const;

function buildRootScriptsSection(): string {
  const rootPkg = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'),
  ) as { scripts?: Record<string, string> };
  const scripts = rootPkg.scripts ?? {};
  const keys = Object.keys(scripts)
    .filter(key => ROOT_SCRIPT_PREFIXES.some(prefix => key.startsWith(prefix)))
    .sort();
  const lines = keys.map(key => `- \`${key}\` — ${scripts[key]}`);
  return lines.join('\n') || '(스크립트 없음)';
}

const DEPLOY_ORDER = `cloudflare → k8s-workstation-system → k8s-workstation-apps
                                    → k8s-workstation-tools`;

export function buildRootManifest(
  packages: WorkspacePackage[],
): RootReadmeManifest {
  const rootReadme = path.join(process.cwd(), 'README.md');
  return {
    kind: 'root',
    projectName: JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'),
    ).name as string,
    workspacePackages: packages.map(p => ({
      relativePath: p.relativePath,
      packageName: p.packageName,
      isInfra: p.isInfra,
    })),
    rootScriptsSection: buildRootScriptsSection(),
    deployOrderSection: DEPLOY_ORDER,
    existingReadmeNote: existingReadmeNote(rootReadme),
  };
}
