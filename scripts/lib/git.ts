import { execSync } from 'node:child_process';

/**
 * Git 명령어를 동기 실행하여 표준 출력 문자열을 반환합니다.
 * 에러 발생 시 빈 문자열을 반환하여 안전하게 폴백할 수 있도록 처리합니다.
 */
export function getGitOutput(command: string): string {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}
