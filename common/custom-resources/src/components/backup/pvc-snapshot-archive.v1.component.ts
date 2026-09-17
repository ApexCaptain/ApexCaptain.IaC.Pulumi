/**
 * Lane A (dr) — PVC VolumeSnapshot → tar.zst → rclone Crypt CronJob
 *
 * dest: k8s-backup/{cluster}/{lane}/{namespace}/{pvc}/{timestamp}/
 * 스크립트: templates/pvc-snapshot-archive.v1/
 *
 * `targets`는 preview에 CronJob이 보이도록 concrete 배열이어야 한다 (Output 금지).
 *
 * @see docs/issues/2026-09-15-pcloud-pvc-encrypted-backup.md
 */
import fs from 'node:fs';
import path from 'node:path';
import * as utils from '@common/utils/src';
import * as k8s from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

const ALPINE_IMAGE = 'alpine:3.21';
const CUSTOM_RESOURCES_PACKAGE_NAME = '@common/custom-resources';
const TEMPLATE_DIR = 'pvc-snapshot-archive.v1';

const CRUD_VERBS = [
  'get',
  'list',
  'watch',
  'create',
  'update',
  'patch',
  'delete',
] as const;

function resolveCustomResourcesPackageRoot(): string {
  let dir = __dirname;
  while (true) {
    const packageJsonPath = path.join(dir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
        name?: string;
      };
      if (pkg.name === CUSTOM_RESOURCES_PACKAGE_NAME) {
        return dir;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(
    `could not resolve ${CUSTOM_RESOURCES_PACKAGE_NAME} package root from ${__dirname}`,
  );
}

const ASSETS_DIR = path.join(
  resolveCustomResourcesPackageRoot(),
  'templates',
  TEMPLATE_DIR,
);

export interface PvcSnapshotArchiveTargetShape {
  /**
   * Pulumi·CronJob 리소스 이름용 안정 키 (Output 금지).
   * 예: `config`
   */
  id: string;
  pvcName: string;
  /**
   * 클론 PVC override. 생략 시 원본 PVC의 storageClass·capacity(없으면 requests)를 따름.
   */
  clone?: {
    storageClassName?: string;
    size?: string;
  };
  schedule: {
    cron: string;
    timezone: string;
  };
  /** 예: `14d` */
  keepWithin: string;
}

interface PvcSnapshotArchiveV1ArgsShape {
  /**
   * K8s 리소스 이름 prefix (DNS-1123).
   * 예: `qbittorrent-backup-dr`, `jellyfin-config-backup`
   */
  namePrefix: string;
  namespace: string;
  targets: PvcSnapshotArchiveTargetShape[];
  platform: {
    namespace: string;
    configMapName: string;
    /**
     * platform credentials Secret 이름.
     * Pulumi로 워크로드 Secret 안 만듦. Job이 런타임 get 후
     * worker에는 base64 env로만 전달 (크로스-NS secretKeyRef 불가).
     */
    credentialsSecretName: string;
    drLeaseName: string;
    volumeSnapshotClassName: string;
  };
  /**
   * true면 target마다 CronJob과 동일 스펙의 one-shot Job 생성 (배포 직후 확인용).
   * 기본 false. Job은 create 시에만 돌고 spec 변경은 ignore (재실행 안 함).
   * 다시 돌리려면 Job 삭제 후 up, 또는 이 플래그를 false→true 전환.
   */
  runOnceOnCreate?: boolean;
  providers: {
    kubernetes: k8s.Provider;
  };
}

export type PvcSnapshotArchiveV1Args =
  utils.types.DeepPulumiInput<PvcSnapshotArchiveV1ArgsShape>;

export const PvcSnapshotArchiveV1Component = utils.functions.defineComponent(
  'pvc-snapshot-archive-v1',
  (
    args: PvcSnapshotArchiveV1Args,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    if (pulumi.Output.isInstance(args.targets)) {
      throw new Error(
        'pvc-snapshot-archive-v1: targets must be a concrete array (not Output) so CronJobs appear in preview',
      );
    }
    if (pulumi.Output.isInstance(args.namePrefix)) {
      throw new Error(
        'pvc-snapshot-archive-v1: namePrefix must be a concrete string (not Output)',
      );
    }

    const namePrefix = args.namePrefix as string;
    const targets = args.targets as PvcSnapshotArchiveTargetShape[];
    const runOnceOnCreate = args.runOnceOnCreate === true;
    const k8sOpts = {
      ...opts,
      provider: args.providers.kubernetes,
    };

    const sharedLabels = {
      'app.kubernetes.io/name': namePrefix,
      'app.kubernetes.io/part-of': 'pcloud-backup',
      'backup.apexcaptain.com/lane': 'dr',
    };

    const serviceAccount = new k8s.core.v1.ServiceAccount(
      `${resourceName}-sa`,
      {
        metadata: {
          name: namePrefix,
          namespace: args.namespace,
          labels: sharedLabels,
        },
      },
      k8sOpts,
    );

    const role = new k8s.rbac.v1.Role(
      `${resourceName}-role`,
      {
        metadata: {
          name: namePrefix,
          namespace: args.namespace,
          labels: sharedLabels,
        },
        rules: [
          {
            apiGroups: ['snapshot.storage.k8s.io'],
            resources: ['volumesnapshots'],
            verbs: [...CRUD_VERBS],
          },
          {
            apiGroups: [''],
            resources: ['persistentvolumeclaims'],
            verbs: [...CRUD_VERBS],
          },
          {
            apiGroups: ['batch'],
            resources: ['jobs'],
            verbs: [...CRUD_VERBS],
          },
          {
            apiGroups: [''],
            resources: ['pods', 'pods/log'],
            verbs: ['get', 'list', 'watch'],
          },
        ],
      },
      k8sOpts,
    );

    const roleBinding = new k8s.rbac.v1.RoleBinding(
      `${resourceName}-roleBinding`,
      {
        metadata: {
          name: namePrefix,
          namespace: args.namespace,
          labels: sharedLabels,
        },
        roleRef: {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: 'Role',
          name: role.metadata.name,
        },
        subjects: [
          {
            kind: 'ServiceAccount',
            name: serviceAccount.metadata.name,
            namespace: args.namespace,
          },
        ],
      },
      {
        ...k8sOpts,
        dependsOn: [role, serviceAccount],
      },
    );

    // platform NS: Lease · ConfigMap(clusterName) · credentials Secret
    const platformRole = new k8s.rbac.v1.Role(
      `${resourceName}-platformRole`,
      {
        metadata: {
          name: `${namePrefix}-platform`,
          namespace: args.platform.namespace,
          labels: sharedLabels,
        },
        rules: [
          {
            apiGroups: ['coordination.k8s.io'],
            resources: ['leases'],
            resourceNames: [args.platform.drLeaseName as pulumi.Input<string>],
            verbs: ['get', 'update', 'patch'],
          },
          {
            apiGroups: [''],
            resources: ['configmaps'],
            resourceNames: [
              args.platform.configMapName as pulumi.Input<string>,
            ],
            verbs: ['get'],
          },
          {
            apiGroups: [''],
            resources: ['secrets'],
            resourceNames: [
              args.platform.credentialsSecretName as pulumi.Input<string>,
            ],
            verbs: ['get'],
          },
        ],
      },
      k8sOpts,
    );

    const platformRoleBinding = new k8s.rbac.v1.RoleBinding(
      `${resourceName}-platformRoleBinding`,
      {
        metadata: {
          name: `${namePrefix}-platform`,
          namespace: args.platform.namespace,
          labels: sharedLabels,
        },
        roleRef: {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: 'Role',
          name: platformRole.metadata.name,
        },
        subjects: [
          {
            kind: 'ServiceAccount',
            name: serviceAccount.metadata.name,
            namespace: args.namespace,
          },
        ],
      },
      {
        ...k8sOpts,
        dependsOn: [platformRole, serviceAccount],
      },
    );

    const scriptConfigMap = new k8s.core.v1.ConfigMap(
      `${resourceName}-script`,
      {
        metadata: {
          name: `${namePrefix}-script`,
          namespace: args.namespace,
          labels: {
            ...sharedLabels,
            'app.kubernetes.io/component': 'script',
          },
        },
        data: {
          'run.sh': fs.readFileSync(path.join(ASSETS_DIR, 'run.sh'), 'utf8'),
          'worker.sh': fs.readFileSync(
            path.join(ASSETS_DIR, 'worker.sh'),
            'utf8',
          ),
        },
      },
      k8sOpts,
    );

    const buildOrchestratorPodTemplate = (
      target: PvcSnapshotArchiveTargetShape,
      labels: Record<string, string>,
    ) => ({
      metadata: {
        labels: {
          ...labels,
          'backup.apexcaptain.com/role': 'orchestrator',
        },
        annotations: {
          'backup.apexcaptain.com/pvc': target.pvcName,
        },
      },
      spec: {
        restartPolicy: 'Never' as const,
        serviceAccountName: serviceAccount.metadata.name,
        containers: [
          {
            name: 'orchestrator',
            image: ALPINE_IMAGE,
            imagePullPolicy: 'IfNotPresent' as const,
            command: ['/bin/sh', '-ec'],
            args: [
              [
                'echo "https://dl-cdn.alpinelinux.org/alpine/v3.21/community" >> /etc/apk/repositories',
                'apk add --no-cache bash curl kubectl coreutils tzdata',
                'exec bash /scripts/run.sh',
              ].join('\n'),
            ],
            env: [
              { name: 'NS', value: args.namespace },
              { name: 'SRC_PVC', value: target.pvcName },
              {
                name: 'SNAP_CLASS',
                value: args.platform.volumeSnapshotClassName,
              },
              {
                name: 'CLONE_STORAGE_CLASS',
                value: target.clone?.storageClassName ?? '',
              },
              {
                name: 'CLONE_SIZE',
                value: target.clone?.size ?? '',
              },
              {
                name: 'CRED_SECRET',
                value: args.platform.credentialsSecretName,
              },
              {
                name: 'SA',
                value: serviceAccount.metadata.name,
              },
              { name: 'LANE', value: 'dr' },
              {
                name: 'KEEP_WITHIN',
                value: target.keepWithin,
              },
              {
                name: 'PLATFORM_NS',
                value: args.platform.namespace,
              },
              {
                name: 'LEASE_NAME',
                value: args.platform.drLeaseName,
              },
              {
                name: 'PLATFORM_CONFIG_CM',
                value: args.platform.configMapName,
              },
              {
                name: 'SCRIPT_CM',
                value: scriptConfigMap.metadata.name,
              },
              { name: 'RESOURCE_PREFIX', value: namePrefix },
              { name: 'ALPINE_IMAGE', value: ALPINE_IMAGE },
            ],
            volumeMounts: [
              {
                name: 'scripts',
                mountPath: '/scripts',
                readOnly: true,
              },
            ],
            resources: {
              requests: { cpu: '50m', memory: '128Mi' },
              limits: { cpu: '500m', memory: '256Mi' },
            },
          },
        ],
        volumes: [
          {
            name: 'scripts',
            configMap: {
              name: scriptConfigMap.metadata.name,
              defaultMode: 0o755,
            },
          },
        ],
      },
    });

    const sharedDependsOn = [
      scriptConfigMap,
      serviceAccount,
      role,
      roleBinding,
      platformRole,
      platformRoleBinding,
    ];

    const cronJobNames: string[] = [];
    const onceJobNames: string[] = [];

    for (const target of targets) {
      if (pulumi.Output.isInstance(target.id)) {
        throw new Error(
          'pvc-snapshot-archive-v1: target.id must be a concrete string (not Output)',
        );
      }
      const targetId = target.id as string;
      const labels = {
        ...sharedLabels,
        'backup.apexcaptain.com/target': targetId,
      };
      const cronJobName = `${namePrefix}-${targetId}`;
      cronJobNames.push(cronJobName);
      const podTemplate = buildOrchestratorPodTemplate(target, labels);

      new k8s.batch.v1.CronJob(
        `${resourceName}-cron-${targetId}`,
        {
          metadata: {
            name: cronJobName,
            namespace: args.namespace,
            labels,
            annotations: {
              'backup.apexcaptain.com/pvc': target.pvcName,
            },
          },
          spec: {
            schedule: target.schedule.cron,
            timeZone: target.schedule.timezone,
            concurrencyPolicy: 'Forbid',
            successfulJobsHistoryLimit: 1,
            failedJobsHistoryLimit: 3,
            jobTemplate: {
              metadata: {
                labels: {
                  ...labels,
                  'backup.apexcaptain.com/role': 'orchestrator',
                },
                annotations: {
                  'backup.apexcaptain.com/pvc': target.pvcName,
                },
              },
              spec: {
                backoffLimit: 1,
                ttlSecondsAfterFinished: 86400,
                template: podTemplate,
              },
            },
          },
        },
        {
          ...k8sOpts,
          dependsOn: sharedDependsOn,
        },
      );

      if (runOnceOnCreate) {
        const onceJobName = `${cronJobName}-once`;
        onceJobNames.push(onceJobName);
        new k8s.batch.v1.Job(
          `${resourceName}-once-${targetId}`,
          {
            metadata: {
              name: onceJobName,
              namespace: args.namespace,
              labels: {
                ...labels,
                'backup.apexcaptain.com/role': 'bootstrap',
              },
              annotations: {
                'backup.apexcaptain.com/pvc': target.pvcName,
              },
            },
            spec: {
              backoffLimit: 1,
              ttlSecondsAfterFinished: 86400,
              template: podTemplate,
            },
          },
          {
            ...k8sOpts,
            // create 시에만 실행. 이후 스크립트/env 변경으로 Job 재실행 방지
            deleteBeforeReplace: true,
            ignoreChanges: ['spec'],
            dependsOn: sharedDependsOn,
          },
        );
      }
    }

    return {
      output: pulumi.output({
        namespace: args.namespace,
        namePrefix,
        scriptConfigMapName: scriptConfigMap.metadata.name,
        serviceAccountName: serviceAccount.metadata.name,
        cronJobNames,
        onceJobNames,
        runOnceOnCreate,
      }),
      secret: pulumi.secret({}),
    };
  },
);
