/**
 * LXCFS on Kubernetes (cndoit18) — 노드에 FUSE 마운트 + MutatingWebhook 주입
 *
 * mesh 밖 (`istio.io/dataplane-mode: none`).
 * webhook는 차트 기본 Pod 라벨 selector를 사용.
 * stale FUSE 마운트는 mount-recovery DaemonSet이 주기적으로 lazy unmount.
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import dedent from 'dedent';

interface LxcfsHelmChartComponentArgsShape {
  helm: {
    lxcfs: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type LxcfsHelmChartComponentArgs =
  utils.types.DeepPulumiInput<LxcfsHelmChartComponentArgsShape>;

export const LxcfsHelmChartComponent = utils.functions.defineComponent(
  'lxcfsHelmChart',
  (
    args: LxcfsHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    // 차트 기본값
    const lxcfsHostMountPath = '/var/lib/lxcfs-on-k8s/lxcfs';
    const mountRecoveryIntervalSeconds = 60;

    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'lxcfs',
          labels: {
            'istio.io/dataplane-mode': 'none',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const lxcfsRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-lxcfsRelease`,
      {
        name: 'lxcfs',
        chart: 'lxcfs-on-kubernetes',
        version: args.helm.lxcfs.version,
        repositoryOpts: {
          repo: args.helm.lxcfs.repositoryUrl,
        },
        namespace: namespace.metadata.name,
        waitForJobs: true,
        values: {
          image: {
            /**
             * v0.2.6+ manager는 runc가 허용하지 않는 `/proc/pressure`를 주입해
             * 라벨이 붙은 Pod가 StartError로 실패하므로 수정 전 버전으로 고정.
             * @see https://github.com/cndoit18/lxcfs-on-kubernetes/issues/128
             */
            manager: 'ghcr.io/cndoit18/lxcfs-manager:v0.2.5',
            // 노드 LXCFS FUSE DaemonSet 이미지
            agent: pulumi.interpolate`ghcr.io/cndoit18/lxcfs-agent:v${args.helm.lxcfs.version}`,
          },
          lxcfs: {
            // 노드마다 agent DaemonSet으로 LXCFS 설치
            useDaemonset: true,
            configMaps: {
              crictlConfig: {
                // agent가 붙는 CRI 소켓 (workstation containerd)
                endpoint: '/run/containerd/containerd.sock',
              },
            },
            // 호스트 LXCFS 마운트 경로 (차트 기본값)
            mountPath: lxcfsHostMountPath,
            // lxcfs 바이너리 플래그 (차트 기본과 동일)
            args: ['-l', '--enable-cfs', '--enable-pidfd'],
            // agent DaemonSet 리소스
            resources: {
              requests: {
                cpu: '50m',
                memory: '64Mi',
              },
              limits: {
                cpu: '200m',
                memory: '128Mi',
              },
            },
          },
          // webhook manager Deployment 리소스
          resources: {
            requests: {
              cpu: '50m',
              memory: '64Mi',
            },
            limits: {
              cpu: '200m',
              memory: '128Mi',
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [namespace],
      },
    );

    /**
     * agent 재시작 등으로 FUSE 마운트가 stale(Transport endpoint is not connected)이 되면
     * 재마운트가 막히므로, 호스트 mount ns에서 주기적으로 감지 후 lazy unmount.
     */
    const mountRecoveryLabels = {
      'app.kubernetes.io/name': 'lxcfs-mount-recovery',
      'app.kubernetes.io/part-of': 'lxcfs',
    };
    new kubernetes.apps.v1.DaemonSet(
      `${resourceName}-lxcfsMountRecoveryDaemonSet`,
      {
        metadata: {
          name: 'lxcfs-mount-recovery',
          namespace: namespace.metadata.name,
          labels: mountRecoveryLabels,
        },
        spec: {
          selector: {
            matchLabels: mountRecoveryLabels,
          },
          template: {
            metadata: {
              labels: mountRecoveryLabels,
            },
            spec: {
              hostPID: true,
              priorityClassName: 'system-node-critical',
              tolerations: [
                {
                  operator: 'Exists',
                  effect: 'NoExecute',
                },
                {
                  operator: 'Exists',
                  effect: 'NoSchedule',
                },
              ],
              containers: [
                {
                  name: 'mount-recovery',
                  image: 'alpine:3.22',
                  command: ['/bin/sh', '-c'],
                  args: [
                    dedent`
                      set -eu
                      apk add --no-cache util-linux >/dev/null
                      while true; do
                        OUT=$(nsenter -t 1 -m -- stat "$MOUNT_PATH" 2>&1 || true)
                        if echo "$OUT" | grep -qiE 'transport endpoint|not connected|stale'; then
                          echo "$(date +%Y-%m-%dT%H:%M:%SZ) broken lxcfs mount at $MOUNT_PATH, lazy unmount" >&2
                          nsenter -t 1 -m -- umount -l "$MOUNT_PATH" 2>/dev/null || true
                        fi
                        sleep "$INTERVAL"
                      done
                    `,
                  ],
                  securityContext: {
                    privileged: true,
                  },
                  env: [
                    {
                      name: 'INTERVAL',
                      value: String(mountRecoveryIntervalSeconds),
                    },
                    {
                      name: 'MOUNT_PATH',
                      value: lxcfsHostMountPath,
                    },
                  ],
                  resources: {
                    requests: {
                      cpu: '10m',
                      memory: '32Mi',
                    },
                    limits: {
                      cpu: '100m',
                      memory: '64Mi',
                    },
                  },
                },
              ],
            },
          },
          updateStrategy: {
            type: 'RollingUpdate',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [namespace, lxcfsRelease],
      },
    );

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
        mountPath: lxcfsHostMountPath,
        releaseName: lxcfsRelease.name,
      }),
      secret: pulumi.secret({}),
    };
  },
);
