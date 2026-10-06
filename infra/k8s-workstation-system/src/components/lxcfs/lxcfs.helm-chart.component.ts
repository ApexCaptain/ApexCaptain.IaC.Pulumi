/**
 * LXCFS on Kubernetes (cndoit18) — 노드에 FUSE 마운트 + MutatingWebhook 주입
 *
 * mesh 밖 (`istio.io/dataplane-mode: none`).
 * webhook은 차트 기본 Pod 라벨 selector를 사용.
 * chart 0.2.8+ agent가 stale FUSE mount self-heal (#122).
 */
import * as utils from '@common/utils/src';
import * as command from '@pulumi/command';
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
  kubeconfig: string;
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type LxcfsHelmChartComponentArgs =
  utils.types.DeepPulumiInput<LxcfsHelmChartComponentArgsShape>;

/** chart 0.2.8 기본 procFiles는 pressure·slabinfo 포함 → runc 1.4.x overmount 실패. */
const LXCFS_PROC_FILES_RUNC_COMPAT = [
  'cpuinfo',
  'diskstats',
  'meminfo',
  'stat',
  'swaps',
  'uptime',
  'loadavg',
];

const LXCFS_MUTATING_WEBHOOK_CONFIGURATION_NAME =
  'lxcfs-lxcfs-on-kubernetes-mutating-webhook-configuration';

export const LxcfsHelmChartComponent = utils.functions.defineComponent(
  'lxcfsHelmChart',
  (
    args: LxcfsHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const lxcfsHostMountPath = '/var/lib/lxcfs-on-k8s/lxcfs';

    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'lxcfs',
          labels: {
            'istio.io/dataplane-mode': 'none',
            'goldilocks.fairwinds.com/enabled': 'true',
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
          lxcfs: {
            useDaemonset: true,
            procFiles: LXCFS_PROC_FILES_RUNC_COMPAT,
            configMaps: {
              crictlConfig: {
                // agent가 붙는 CRI 소켓 (workstation containerd)
                endpoint: '/run/containerd/containerd.sock',
              },
            },
            mountPath: lxcfsHostMountPath,
            args: ['-l', '--enable-cfs', '--enable-pidfd'],
            resources: {
              requests: {
                cpu: '50m',
                memory: '128Mi',
              },
              limits: {
                cpu: '200m',
                memory: '256Mi',
              },
            },
          },
          resources: {
            requests: {
              cpu: '50m',
              memory: '128Mi',
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
     * Helm upgrade만으로 MutatingWebhook의 legacy namespaceSelector가 남는 경우가 있어,
     * chart 0.2.8(objectSelector만)과 맞추기 위해 helm release 이후 idempotent prune.
     */
    const pruneLegacyNamespaceSelector = dedent`
      set -euo pipefail
      tmp=$(mktemp)
      trap 'rm -f "$tmp"' EXIT
      printf '%s\\n' "$KUBECONFIG_CONTENT" > "$tmp"
      export KUBECONFIG="$tmp"
      MWH="${LXCFS_MUTATING_WEBHOOK_CONFIGURATION_NAME}"
      if ! kubectl get mutatingwebhookconfiguration "$MWH" >/dev/null 2>&1; then
        exit 0
      fi
      if kubectl get mutatingwebhookconfiguration "$MWH" -o jsonpath='{.webhooks[0].namespaceSelector.matchLabels}' 2>/dev/null | grep -q mount-lxcfs; then
        kubectl patch mutatingwebhookconfiguration "$MWH" --type=json -p='[{"op":"remove","path":"/webhooks/0/namespaceSelector"}]'
      fi
    `;

    new command.local.Command(
      `${resourceName}-pruneLegacyNamespaceSelector`,
      {
        create: pruneLegacyNamespaceSelector,
        update: pruneLegacyNamespaceSelector,
        addPreviousOutputInEnv: false,
        triggers: [lxcfsRelease.id],
        environment: {
          KUBECONFIG_CONTENT: pulumi.secret(args.kubeconfig),
        },
      },
      {
        ...opts,
        dependsOn: [lxcfsRelease],
        additionalSecretOutputs: ['stdout', 'stderr'],
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
