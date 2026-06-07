import fs from 'fs';
import path from 'node:path';

interface GenerateHuskyHooksOptions {
  projectPath: string;
  hooks: {
    'applypatch-msg'?: string;
    'commit-msg'?: string;
    'post-applypatch'?: string;
    'post-checkout'?: string;
    'post-commit'?: string;
    'post-merge'?: string;
    'post-rewrite'?: string;
    'pre-applypatch'?: string;
    'pre-auto-gc'?: string;
    'pre-commit'?: string;
    'pre-merge-commit'?: string;
    'pre-push'?: string;
    'pre-rebase'?: string;
    'prepare-commit-msg'?: string;
  };
}

export function generateHuskyHooks(options: GenerateHuskyHooksOptions) {
  const { projectPath, hooks } = options;
  const baseDirPath = path.join(projectPath, '.husky');
  if (!fs.existsSync(baseDirPath)) {
    fs.mkdirSync(baseDirPath, { recursive: true });
  }

  // Clear previous hooks
  fs.readdirSync(baseDirPath).forEach(eachHook => {
    const previousHookFile = path.join(baseDirPath, eachHook);
    if (
      fs.existsSync(previousHookFile) &&
      fs.statSync(previousHookFile).isFile()
    ) {
      fs.unlinkSync(previousHookFile);
    }
  });

  // Generate new hooks
  Object.entries(hooks).forEach(([hookName, hookContent]) => {
    const hookFilePath = path.join(baseDirPath, hookName);
    fs.writeFileSync(hookFilePath, hookContent);
  });
}
