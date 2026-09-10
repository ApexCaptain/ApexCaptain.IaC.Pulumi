import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * lint-staged는 git 루트에서 eslint를 한 번에 돌린다.
 * 패키지 `.eslintrc.json`의 `parserOptions.project` (`./test/tsconfig.json`)가
 * cwd 기준으로 루트 `test/tsconfig.json`에 붙어서 패키지 `src/` 파싱이 실패한다.
 * 가장 가까운 `.eslintrc.json` 디렉터리에서 상대 경로로 eslint를 돌린다.
 */
const ignoredPathPart = (filePath: string): boolean => {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.includes('/sdks/') ||
    normalized.includes('/node_modules/') ||
    normalized.includes('/lib/')
  );
};

const findEslintCwd = (filePath: string, repoRoot: string): string => {
  let dir = path.dirname(path.resolve(repoRoot, filePath));
  while (true) {
    if (fs.existsSync(path.join(dir, '.eslintrc.json'))) {
      return dir;
    }
    if (dir === repoRoot) {
      return repoRoot;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return repoRoot;
    }
    dir = parent;
  }
};

const lintStagedEslint = (): void => {
  const repoRoot = process.cwd();
  const files = process.argv.slice(2).filter(file => !ignoredPathPart(file));
  if (files.length === 0) {
    return;
  }

  const groups = new Map<string, string[]>();
  for (const file of files) {
    const cwd = findEslintCwd(file, repoRoot);
    const abs = path.resolve(repoRoot, file);
    const relative = path.relative(cwd, abs);
    const existing = groups.get(cwd) ?? [];
    existing.push(relative);
    groups.set(cwd, existing);
  }

  const eslintBin = path.join(repoRoot, 'node_modules', '.bin', 'eslint');
  for (const [cwd, groupFiles] of groups) {
    const result = spawnSync(
      eslintBin,
      ['--fix', '--no-error-on-unmatched-pattern', ...groupFiles],
      {
        cwd,
        stdio: 'inherit',
        env: process.env,
      },
    );
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
};

lintStagedEslint();
