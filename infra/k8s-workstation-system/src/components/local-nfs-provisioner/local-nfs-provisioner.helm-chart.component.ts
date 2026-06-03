import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface LocalNfsProvisionerHelmChartComponentArgsShape {
  namespace: string;
  version: string;
  nfsSharedServiceDirName: string;
  internalNfsServerIp: {
    hdd0: string;
    ssd0: string;
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type LocalNfsProvisionerHelmChartComponentArgs =
  utils.types.DeepPulumiInput<LocalNfsProvisionerHelmChartComponentArgsShape>;

export const LocalNfsProvisionerHelmChartComponent =
  utils.functions.defineComponent(
    'localNfsProvisionerHelmChart',
    (
      args: LocalNfsProvisionerHelmChartComponentArgs,
      opts: pulumi.ComponentResourceOptions,
      resourceName: string,
    ) => {
      // Common Configuration
      const chartName = 'nfs-subdir-external-provisioner';
      const chartUrl =
        'https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner';

      // HDD 0
      const nfsSubDirHdd0StorageClassName = 'nfs-subdir-hdd0';
      const hdd0NfsSubdirProvisionerRelease = new kubernetes.helm.v3.Release(
        `${resourceName}-hdd0NfsSubdirProvisionerRelease`,
        {
          name: 'hdd0-nfs-subdir-provisioner',
          chart: chartName,
          version: args.version,
          namespace: args.namespace,
          repositoryOpts: {
            repo: chartUrl,
          },
          values: {
            nfs: {
              path: pulumi.interpolate`/${args.nfsSharedServiceDirName}`,
              server: args.internalNfsServerIp.hdd0,
            },
            storageClass: {
              name: nfsSubDirHdd0StorageClassName,
              archiveOnDelete: false,
              accessModes: 'ReadWriteMany',
              pathPattern: '${.PVC.namespace}/${.PVC.name}',
            },
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

      // SSD 0
      const nfsSubDirSsd0StorageClassName = 'nfs-subdir-ssd0';
      const ssd0NfsSubdirProvisionerRelease = new kubernetes.helm.v3.Release(
        `${resourceName}-ssd0NfsSubdirProvisionerRelease`,
        {
          name: 'ssd0-nfs-subdir-provisioner',
          chart: chartName,
          version: args.version,
          namespace: args.namespace,
          repositoryOpts: {
            repo: chartUrl,
          },
          values: {
            nfs: {
              path: pulumi.interpolate`/${args.nfsSharedServiceDirName}`,
              server: args.internalNfsServerIp.ssd0,
            },
            storageClass: {
              name: nfsSubDirSsd0StorageClassName,
              archiveOnDelete: false,
              accessModes: 'ReadWriteMany',
              pathPattern: '${.PVC.namespace}/${.PVC.name}',
            },
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

      return {
        output: pulumi.output({
          storageClass: {
            hdd0: nfsSubDirHdd0StorageClassName,
            ssd0: nfsSubDirSsd0StorageClassName,
          },
        }),
        secret: pulumi.secret({}),
      };
    },
  );
