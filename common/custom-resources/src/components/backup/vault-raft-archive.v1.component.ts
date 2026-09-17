/**
 * Lane A (dr) — Vault raft snapshot → rclone Crypt CronJob
 *
 * dest: k8s-backup/{cluster}/{lane}/{namespace}/{leaf}/{timestamp}/
 * 파일: vault-raft.snap
 * 스크립트: templates/vault-raft-archive.v1/
 *
 * PVC/file copy·VolumeSnapshot 금지. `vault operator raft snapshot`만.
 *
 * @see docs/issues/2026-09-15-pcloud-pvc-encrypted-backup.md
 */
import fs from 'node:fs';
import path from 'node:path';
import * as utils from '@common/utils/src';
import * as k8s from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

const ALPINE_IMAGE = 'alpine:3.21';
/** 클러스터 vault-0 이미지와 맞춤 (hashicorp/vault:2.0.4) */
const VAULT_CLI_VERSION = '2.0.4';
const CUSTOM_RESOURCES_PACKAGE_NAME = '@common/custom-resources';
const TEMPLATE_DIR = 'vault-raft-archive.v1';

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

interface VaultRaftArchiveV1ArgsShape {
  /**
   * K8s 리소스 이름 prefix (DNS-1123). SA 이름과 동일.
   * 예: `vault-backup-raft`
   */
  namePrefix: string;
  /** Vault 서버 Namespace */
  namespace: string;
  /**
   * pCloud path leaf (보통 PVC 이름과 맞춤).
   * 예: `data-vault-0`
   */
  leafName: string;
  schedule: {
    cron: string;
    timezone: string;
  };
  /** 예: `2d` */
  keepWithin: string;
  platform: {
    namespace: string;
    configMapName: string;
    credentialsSecretName: string;
    drLeaseName: string;
  };
  vault: {
    /** 예: `https://vault.vault.svc.cluster.local:8200` */
    address: string;
    caSecretName: string;
    /** Secret key. 기본 `ca.crt` */
    caSecretKey?: string;
    kubernetesAuthMountPath: string;
    kubernetesAuthRoleName: string;
  };
  /**
   * true면 CronJob과 동일 스펙 one-shot Job (배포 직후 확인용).
   * 기본 false. create 시에만 실행; spec 변경 ignore.
   */
  runOnceOnCreate?: boolean;
  providers: {
    kubernetes: k8s.Provider;
  };
}

export type VaultRaftArchiveV1Args =
  utils.types.DeepPulumiInput<VaultRaftArchiveV1ArgsShape>;

export const VaultRaftArchiveV1Component = utils.functions.defineComponent(
  'vault-raft-archive-v1',
  (
    args: VaultRaftArchiveV1Args,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    if (pulumi.Output.isInstance(args.namePrefix)) {
      throw new Error(
        'vault-raft-archive-v1: namePrefix must be a concrete string (not Output)',
      );
    }
    if (pulumi.Output.isInstance(args.leafName)) {
      throw new Error(
        'vault-raft-archive-v1: leafName must be a concrete string (not Output)',
      );
    }

    const namePrefix = args.namePrefix as string;
    const leafName = args.leafName as string;
    const runOnceOnCreate = args.runOnceOnCreate === true;
    // DeepPulumiInput makes optional fields Output|undefined; mount key는 평문 고정
    const caSecretKey =
      typeof args.vault.caSecretKey === 'string' && args.vault.caSecretKey.length > 0
        ? args.vault.caSecretKey
        : 'ca.crt';
    const k8sOpts = {
      ...opts,
      provider: args.providers.kubernetes,
    };

    const sharedLabels = {
      'app.kubernetes.io/name': namePrefix,
      'app.kubernetes.io/part-of': 'pcloud-backup',
      'backup.apexcaptain.com/lane': 'dr',
      'backup.apexcaptain.com/kind': 'vault-raft',
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
        },
      },
      k8sOpts,
    );

    const cronJobName = namePrefix;
    const onceJobName = `${namePrefix}-once`;

    const podTemplate = {
      metadata: {
        labels: {
          ...sharedLabels,
          'backup.apexcaptain.com/role': 'orchestrator',
        },
        annotations: {
          'backup.apexcaptain.com/leaf': leafName,
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
                'apk add --no-cache bash curl kubectl rclone coreutils tzdata unzip',
                'exec bash /scripts/run.sh',
              ].join('\n'),
            ],
            env: [
              { name: 'NS', value: args.namespace },
              { name: 'LEAF_NAME', value: leafName },
              {
                name: 'CRED_SECRET',
                value: args.platform.credentialsSecretName,
              },
              { name: 'LANE', value: 'dr' },
              { name: 'KEEP_WITHIN', value: args.keepWithin },
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
              { name: 'RESOURCE_PREFIX', value: namePrefix },
              { name: 'VAULT_ADDR', value: args.vault.address },
              { name: 'VAULT_CACERT', value: '/vault-ca/ca.crt' },
              {
                name: 'VAULT_K8S_AUTH_MOUNT',
                value: args.vault.kubernetesAuthMountPath,
              },
              {
                name: 'VAULT_K8S_AUTH_ROLE',
                value: args.vault.kubernetesAuthRoleName,
              },
              { name: 'VAULT_VERSION', value: VAULT_CLI_VERSION },
            ],
            volumeMounts: [
              {
                name: 'scripts',
                mountPath: '/scripts',
                readOnly: true,
              },
              {
                name: 'vault-ca',
                mountPath: '/vault-ca',
                readOnly: true,
              },
              {
                name: 'work',
                mountPath: '/work',
              },
            ],
            resources: {
              requests: { cpu: '50m', memory: '128Mi' },
              limits: { cpu: '500m', memory: '512Mi' },
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
          {
            name: 'vault-ca',
            secret: {
              secretName: args.vault.caSecretName,
              items: [
                {
                  key: caSecretKey,
                  path: 'ca.crt',
                },
              ],
            },
          },
          {
            name: 'work',
            emptyDir: {},
          },
        ],
      },
    };

    const sharedDependsOn = [
      scriptConfigMap,
      serviceAccount,
      platformRole,
      platformRoleBinding,
    ];

    new k8s.batch.v1.CronJob(
      `${resourceName}-cron`,
      {
        metadata: {
          name: cronJobName,
          namespace: args.namespace,
          labels: sharedLabels,
          annotations: {
            'backup.apexcaptain.com/leaf': leafName,
          },
        },
        spec: {
          schedule: args.schedule.cron,
          timeZone: args.schedule.timezone,
          concurrencyPolicy: 'Forbid',
          successfulJobsHistoryLimit: 1,
          failedJobsHistoryLimit: 3,
          jobTemplate: {
            metadata: {
              labels: {
                ...sharedLabels,
                'backup.apexcaptain.com/role': 'orchestrator',
              },
              annotations: {
                'backup.apexcaptain.com/leaf': leafName,
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

    const onceJobNames: string[] = [];
    if (runOnceOnCreate) {
      onceJobNames.push(onceJobName);
      new k8s.batch.v1.Job(
        `${resourceName}-once`,
        {
          metadata: {
            name: onceJobName,
            namespace: args.namespace,
            labels: {
              ...sharedLabels,
              'backup.apexcaptain.com/role': 'bootstrap',
            },
            annotations: {
              'backup.apexcaptain.com/leaf': leafName,
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
          deleteBeforeReplace: true,
          ignoreChanges: ['spec'],
          dependsOn: sharedDependsOn,
        },
      );
    }

    return {
      output: pulumi.output({
        namespace: args.namespace,
        namePrefix,
        leafName,
        scriptConfigMapName: scriptConfigMap.metadata.name,
        serviceAccountName: serviceAccount.metadata.name,
        cronJobName,
        onceJobNames,
        runOnceOnCreate,
        kubernetesAuthRoleName: args.vault.kubernetesAuthRoleName,
      }),
      secret: pulumi.secret({}),
    };
  },
);
