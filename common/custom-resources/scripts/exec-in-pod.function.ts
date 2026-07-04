import { Readable, Writable } from 'node:stream';
import * as k8s from '@kubernetes/client-node';

const DEFAULT_SHELL = '/bin/sh';

export type ExecInPodArgs = {
  kubeconfig: string;
  namespace: string;
  podName: string;
  containerName: string;
  /** Pod 안에서 `{shell} -ec`로 실행할 스크립트 */
  script: string;
  /** 실행할 셸 경로. 기본값 `/bin/sh` */
  shell?: string;
  stdin?: string;
};

export type ExecInPodResult = {
  stdout: string;
  stderr: string;
};

export function loadKubeConfig(kubeconfig: string): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  if (kubeconfig.trimStart().startsWith('apiVersion:')) {
    kc.loadFromString(kubeconfig);
  } else {
    kc.loadFromFile(kubeconfig);
  }
  return kc;
}

export async function execInPod(
  args: ExecInPodArgs,
): Promise<ExecInPodResult> {
  const kc = loadKubeConfig(args.kubeconfig);
  return execInPodWithKubeConfig(kc, args);
}

export async function execInPodWithKubeConfig(
  kubeConfig: k8s.KubeConfig,
  args: Omit<ExecInPodArgs, 'kubeconfig'>,
): Promise<ExecInPodResult> {
  const execClient = new k8s.Exec(kubeConfig);
  const stdout = createCollectingWritable();
  const stderr = createCollectingWritable();
  const stdin =
    args.stdin != null ? Readable.from([args.stdin]) : null;
  const shell = args.shell ?? DEFAULT_SHELL;

  await new Promise<void>((resolve, reject) => {
    void execClient
      .exec(
        args.namespace,
        args.podName,
        args.containerName,
        [shell, '-ec', args.script],
        stdout.stream,
        stderr.stream,
        stdin,
        false,
        status => {
          if (status.status === 'Success') {
            resolve();
            return;
          }
          reject(
            new Error(
              status.message ||
                stderr.getText() ||
                `pod exec failed: ${status.reason ?? 'unknown'}`,
            ),
          );
        },
      )
      .catch(reject);
  });

  return { stdout: stdout.getText(), stderr: stderr.getText() };
}

function createCollectingWritable(): {
  stream: Writable;
  getText: () => string;
} {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });
  return {
    stream,
    getText: () => Buffer.concat(chunks).toString('utf8'),
  };
}
