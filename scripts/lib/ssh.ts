import { Client, type ConnectConfig } from 'ssh2';

export interface SshExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * SSH 클라이언트를 원격 서버에 비동기로 연결합니다.
 */
export function connectSsh(
  client: Client,
  config: ConnectConfig,
): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once('ready', resolve).once('error', reject).connect(config);
  });
}

/**
 * SSH 세션 상에서 단일 쉘 명령어를 실행하고 stdout, stderr, 종료 코드를 반환합니다.
 * stdin 입력이 필요한 경우(예: sudo 비밀번호 전달) 스트림에 쓰고 종료합니다.
 */
export function execSsh(
  client: Client,
  command: string,
  stdin?: string,
): Promise<SshExecResult> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) return reject(err);
      if (stdin) {
        stream.write(stdin);
        stream.end();
      }
      let stdout = '';
      let stderr = '';
      stream.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      stream.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      stream.on('close', (code: number) => {
        resolve({ stdout, stderr, code });
      });
    });
  });
}
