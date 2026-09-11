import { execSync } from 'node:child_process';
import path from 'node:path';

function bootstrapLocalEnv(): void {
  execSync('git submodule update --init --recursive', { stdio: 'inherit' });
  const requirementsPath = path.join(process.cwd(), 'requirements.txt');
  const log = execSync(`pip install -r ${requirementsPath}`, {
    encoding: 'utf-8',
  });
  console.log(log);
}

bootstrapLocalEnv();
