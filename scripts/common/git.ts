import { execSync } from 'node:child_process';
import path from 'node:path';
import chalk from 'chalk';

/**
 * 변경사항(diff) 내에 포함되면 안 되는 민감 문자열(토큰, Private Key 등) 정규식 목록
 */
export const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /ghp_[A-Za-z0-9]{36}/,
  /gho_[A-Za-z0-9]{36}/,
  /cursor_[A-Za-z0-9]{40,}/,
  /AKIA[0-9A-Z]{16}/,
];

/**
 * Git에 커밋되어서는 안 되는 민감 파일 패턴 목록
 */
export const SENSITIVE_FILE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /^credentials\.json$/i,
  /\.(pem|key)$/i,
  /^id_(rsa|ed25519|ecdsa)$/i,
  /^\.secrets\//i,
  /^\.keys\//i,
];

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

/**
 * Git 상태(status)와 변경 내용(diff)을 검사하여 민감 파일이나 시크릿 문자열이 포함되어 있는지 검증합니다.
 * 감지될 경우 에러 메시지를 출력하고 프로세스를 즉시 종료(exit 1)합니다.
 */
export function checkSecretLeak(
  statusOutput: string,
  diffOutput: string,
): void {
  const statusLines = statusOutput.split('\n').filter(Boolean);
  for (const line of statusLines) {
    const filePath = line.slice(3).trim();
    const fileName = path.basename(filePath);
    if (
      SENSITIVE_FILE_PATTERNS.some(
        pattern => pattern.test(filePath) || pattern.test(fileName),
      )
    ) {
      console.error(
        chalk.red(
          `[보안 경고] 민감 파일(${filePath})이 변경 사항에 포함되어 있습니다.`,
        ),
      );
      process.exit(1);
    }
  }

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(diffOutput)) {
      console.error(
        chalk.red(
          `[보안 경고] 변경 사항(diff) 내에 민감 정보(토큰, Private Key 등)가 감지되었습니다.`,
        ),
      );
      process.exit(1);
    }
  }
}

/**
 * LLM 응답 텍스트에 포함된 마크다운 코드 블록(``` 또는 ```json 등) 펜스를 제거하여
 * 순수 텍스트 또는 JSON 원본 문자열을 추출합니다.
 */
export function cleanMarkdownCodeFence(content: string, tag = ''): string {
  let cleaned = content.trim();
  const pattern = new RegExp('^```' + tag + '\\s*');
  if (pattern.test(cleaned)) {
    cleaned = cleaned
      .replace(pattern, '')
      .replace(/\s*```$/, '')
      .trim();
  } else if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
    cleaned = cleaned
      .replace(/^```[^\n]*\n/, '')
      .replace(/\n```$/, '')
      .trim();
  }
  return cleaned;
}
