import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 형제 레포 로컬 클론. submodule 대신 gitignore된 `repos/` 아래에 둔다.
 * Argo CD는 GitOps `main` HEAD를 보므로 부모 레포에 커밋 포인터를 두지 않는다.
 */
const siblingRepositories = [
  {
    dir: 'repos/gitops',
    url: 'https://github.com/ApexCaptain/ApexCaptain.IaC.GitOps.git',
    branch: 'main',
  },
];

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' });
}

// 실패해도 bootstrap 전체는 막지 않는다 (네트워크·권한 문제는 경고만)
function syncSiblingRepository(repo: (typeof siblingRepositories)[number]) {
  const dir = path.join(process.cwd(), repo.dir);
  try {
    if (!fs.existsSync(path.join(dir, '.git'))) {
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      // --branch 없이: 빈 레포도 clone된다 (기본 브랜치 = main)
      execFileSync('git', ['clone', repo.url, dir], {
        stdio: 'inherit',
      });
      return;
    }
    // 빈 레포는 원격 브랜치가 없다
    if (!git(dir, ['ls-remote', '--heads', 'origin', repo.branch]).trim()) {
      console.warn(
        `⚠️  ${repo.dir}: origin/${repo.branch} 없음 (빈 레포). 건너뜀`,
      );
      return;
    }
    if (git(dir, ['status', '--porcelain']).trim()) {
      console.warn(`⚠️  ${repo.dir}: 로컬 변경 있음. pull 건너뜀`);
      return;
    }
    if (
      git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim() !== repo.branch
    ) {
      console.warn(`⚠️  ${repo.dir}: ${repo.branch} 브랜치 아님. pull 건너뜀`);
      return;
    }
    execFileSync('git', ['pull', '--ff-only', 'origin', repo.branch], {
      cwd: dir,
      stdio: 'inherit',
    });
  } catch (error) {
    console.warn(`⚠️  ${repo.dir}: 동기화 실패. 건너뜀\n${String(error)}`);
  }
}

function bootstrapLocalEnv(): void {
  execFileSync('git', ['submodule', 'update', '--init', '--recursive'], {
    stdio: 'inherit',
  });
  siblingRepositories.forEach(syncSiblingRepository);
  const requirementsPath = path.join(process.cwd(), 'requirements.txt');
  const log = execFileSync('pip', ['install', '-r', requirementsPath], {
    encoding: 'utf-8',
  });
  console.log(log);
}

bootstrapLocalEnv();
