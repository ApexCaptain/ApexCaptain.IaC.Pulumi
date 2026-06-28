import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';

export type KubectlPortForwardResourceType = 'svc' | 'pod';

export interface EnsureKubectlPortForwardArgs {
  /** Pulumi 리소스 name — PID 파일 식별용 */
  name: string;
  kubeconfig: string;
  namespace: string;
  resourceType: KubectlPortForwardResourceType;
  resourceName: string;
  localPort: number;
  remotePort: number;
  localHost?: string;
  protocol?: 'http' | 'https';
  readinessTimeoutSeconds?: number;
}

export type EnsureKubectlPortForwardResult = {
  localAddress: string;
};

export function getKubectlPortForwardPidFilePath(resourceName: string): string {
  return `/tmp/pulumi-kubectl-pf-${pulumi.getStack()}-${pulumi.getProject()}-${resourceName}.pid`;
}

function getKubectlPortForwardLogPath(resourceName: string): string {
  return `/tmp/pulumi-kubectl-pf-${pulumi.getStack()}-${resourceName}.log`;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isPortListening(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

async function isPortForwardHealthy(
  pidFilePath: string,
  host: string,
  port: number,
): Promise<boolean> {
  if (!fs.existsSync(pidFilePath)) {
    return false;
  }

  const pid = Number(fs.readFileSync(pidFilePath, 'utf8').trim());
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  if (!isProcessAlive(pid)) {
    return false;
  }

  return isPortListening(host, port);
}

export async function stopKubectlPortForward(
  pidFilePath: string,
): Promise<void> {
  if (!fs.existsSync(pidFilePath)) {
    return;
  }

  const pid = Number(fs.readFileSync(pidFilePath, 'utf8').trim());
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 'SIGTERM');
      await utils.functions.waitForMs(500);
      if (isProcessAlive(pid)) {
        process.kill(pid, 'SIGKILL');
      }
    } catch {
      // 이미 종료됨
    }
  }

  fs.unlinkSync(pidFilePath);
}

function startKubectlPortForward(
  args: EnsureKubectlPortForwardArgs & {
    localHost: string;
    pidFilePath: string;
  },
): void {
  const logPath = getKubectlPortForwardLogPath(args.name);
  const logFd = fs.openSync(logPath, 'a');

  const child = spawn(
    'kubectl',
    [
      'port-forward',
      '--address',
      args.localHost,
      '-n',
      args.namespace,
      `${args.resourceType}/${args.resourceName}`,
      `${args.localPort}:${args.remotePort}`,
    ],
    {
      env: {
        ...process.env,
        KUBECONFIG: args.kubeconfig,
      },
      detached: true,
      stdio: ['ignore', logFd, logFd],
    },
  );

  child.unref();

  if (child.pid == null) {
    throw new Error('kubectl port-forward failed to start');
  }

  fs.writeFileSync(args.pidFilePath, String(child.pid));
}

/**
 * PID·로컬 포트가 healthy면 유지, 아니면 kubectl port-forward를 (재)시작합니다.
 * pulumi up마다 Output.apply로 호출되는 것을 전제로 합니다.
 */
export async function ensureKubectlPortForward(
  args: EnsureKubectlPortForwardArgs,
): Promise<EnsureKubectlPortForwardResult> {
  const localHost = args.localHost ?? '127.0.0.1';
  const protocol = args.protocol ?? 'http';
  const readinessTimeoutSeconds = args.readinessTimeoutSeconds ?? 60;
  const localAddress = `${protocol}://${localHost}:${args.localPort}`;
  const pidFilePath = getKubectlPortForwardPidFilePath(args.name);

  if (pulumi.runtime.isDryRun()) {
    await pulumi.log.info(`kubectl port-forward dry-run: ${localAddress}`);
    return { localAddress };
  }

  if (await isPortForwardHealthy(pidFilePath, localHost, args.localPort)) {
    return { localAddress };
  }

  await pulumi.log.info(
    `kubectl port-forward is not healthy; restarting (${localAddress})`,
  );
  await stopKubectlPortForward(pidFilePath);

  const portInUse = await isPortListening(localHost, args.localPort);
  if (portInUse) {
    throw new Error(
      `local port ${localHost}:${args.localPort} is already in use by another process`,
    );
  }

  startKubectlPortForward({
    ...args,
    localHost,
    pidFilePath,
  });

  const deadline = Date.now() + readinessTimeoutSeconds * 1000;
  while (Date.now() < deadline) {
    if (await isPortListening(localHost, args.localPort)) {
      await pulumi.log.info(`kubectl port-forward ready: ${localAddress}`);
      return { localAddress };
    }
    await utils.functions.waitForMs(1000);
  }

  throw new Error(
    `kubectl port-forward did not become ready on ${localAddress}`,
  );
}
