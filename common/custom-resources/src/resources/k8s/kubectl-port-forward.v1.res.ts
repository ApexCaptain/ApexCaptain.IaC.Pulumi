import * as utils from '@common/utils/src';
import * as command from '@pulumi/command';
import * as pulumi from '@pulumi/pulumi';
import dedent from 'dedent';
import {
  ensureKubectlPortForward,
  getKubectlPortForwardPidFilePath,
  type KubectlPortForwardResourceType,
} from '../../kubernetes/ensure-kubectl-port-forward.function';

interface KubectlPortForwardV1ArgsShape {
  kubeconfig: string;
  namespace: string;
  resourceType: KubectlPortForwardResourceType;
  resourceName: string;
  localPort: number;
  remotePort: number;
  /** port-forward 바인드 주소. 기본 127.0.0.1 */
  localHost?: string;
  /** localAddress URL scheme. 기본 http */
  protocol?: 'http' | 'https';
  /** 로컬 포트 listen 대기 시간(초). 기본 60 */
  readinessTimeoutSeconds?: number;
}

export type KubectlPortForwardV1Args =
  utils.types.DeepPulumiInput<KubectlPortForwardV1ArgsShape>;

export type { KubectlPortForwardResourceType };

/**
 * `kubectl port-forward`를 Pulumi 스택 수명에 맞게 관리합니다.
 *
 * - **매 `pulumi up`**: `localAddress` Output 평가 시 healthy 검사 → 죽었으면 재시작
 * - **`pulumi destroy`**: cleanup Command delete에서 PID 종료
 * - **`preview`**: dry-run stub
 */
export class KubectlPortForwardV1 extends pulumi.ComponentResource {
  readonly localHost: pulumi.Output<string>;
  readonly localPort: pulumi.Output<number>;
  readonly localAddress: pulumi.Output<string>;
  readonly pidFilePath: pulumi.Output<string>;

  constructor(
    name: string,
    args: KubectlPortForwardV1Args,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super('custom-resources:k8s:KubectlPortForwardV1', name, {}, opts);

    const localHost: pulumi.Output<string> = pulumi
      .output(args.localHost)
      .apply(value => value ?? '127.0.0.1');
    const localPort = pulumi.output(args.localPort);
    const pidFilePath = pulumi.output(getKubectlPortForwardPidFilePath(name));

    const ensured = pulumi.all([args]).apply(async ([resolvedArgs]) => {
      const resolvedLocalHost = resolvedArgs.localHost ?? '127.0.0.1';
      return ensureKubectlPortForward({
        name,
        kubeconfig: resolvedArgs.kubeconfig,
        namespace: resolvedArgs.namespace,
        resourceType: resolvedArgs.resourceType,
        resourceName: resolvedArgs.resourceName,
        localPort: resolvedArgs.localPort,
        remotePort: resolvedArgs.remotePort,
        localHost: resolvedLocalHost,
        protocol: resolvedArgs.protocol,
        readinessTimeoutSeconds: resolvedArgs.readinessTimeoutSeconds,
      });
    });

    this.localAddress = ensured.apply(result => result.localAddress);

    const deleteCommand = pidFilePath.apply(resolvedPidFilePath => {
      if (pulumi.runtime.isDryRun()) {
        return 'echo "kubectl port-forward delete dry-run"';
      }

      return dedent`
        set -eu
        if [ -f "${resolvedPidFilePath}" ]; then
          kill "$(cat "${resolvedPidFilePath}")" 2>/dev/null || true
          rm -f "${resolvedPidFilePath}"
        fi
      `;
    });

    new command.local.Command(
      `${name}-cleanup`,
      {
        create: 'echo "kubectl port-forward cleanup registered"',
        delete: deleteCommand,
      },
      { parent: this },
    );

    this.localHost = localHost;
    this.localPort = localPort;
    this.pidFilePath = pidFilePath;

    this.registerOutputs({
      localAddress: this.localAddress,
      localHost: this.localHost,
      localPort: this.localPort,
      pidFilePath: this.pidFilePath,
    });
  }
}
