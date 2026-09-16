/**
 * CSI snapshot-controller (Piraeus Helm) — VolumeSnapshot CRD + 컨트롤러
 *
 * Longhorn은 CSI sidecar(`csi-snapshotter`)만 띄움. 클러스터 CRD·컨트롤러는 여기.
 * VolumeSnapshotClass는 pcloud-backup Platform이 소유.
 *
 * @see docs/issues/2026-09-15-pcloud-pvc-encrypted-backup.md
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface SnapshotControllerHelmChartComponentArgsShape {
  helm: {
    snapshotController: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type SnapshotControllerHelmChartComponentArgs =
  utils.types.DeepPulumiInput<SnapshotControllerHelmChartComponentArgsShape>;

export const SnapshotControllerHelmChartComponent =
  utils.functions.defineComponent(
    'snapshotControllerHelmChart',
    (
      args: SnapshotControllerHelmChartComponentArgs,
      opts: pulumi.ComponentResourceOptions,
      resourceName: string,
    ) => {
      const namespace = new kubernetes.core.v1.Namespace(
        `${resourceName}-namespace`,
        {
          metadata: {
            name: 'snapshot-controller',
            labels: {
              'app.kubernetes.io/name': 'snapshot-controller',
              'goldilocks.fairwinds.com/enabled': 'true',
            },
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

      const release = new kubernetes.helm.v3.Release(
        `${resourceName}-release`,
        {
          name: 'snapshot-controller',
          chart: 'snapshot-controller',
          version: args.helm.snapshotController.version,
          namespace: namespace.metadata.name,
          repositoryOpts: {
            repo: args.helm.snapshotController.repositoryUrl,
          },
          waitForJobs: true,
          values: {
            installCRDs: true,
            // Volume group 변환 webhook 불필요 (차트 5.2 기본 false)
            webhook: {
              enabled: false,
            },
            controller: {
              resources: {
                requests: {
                  cpu: '20m',
                  memory: '64Mi',
                },
                limits: {
                  cpu: '200m',
                  memory: '256Mi',
                },
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

      return {
        output: pulumi.output({
          namespace: namespace.metadata.name,
          releaseName: release.name,
        }),
        secret: pulumi.secret({}),
      };
    },
  );
