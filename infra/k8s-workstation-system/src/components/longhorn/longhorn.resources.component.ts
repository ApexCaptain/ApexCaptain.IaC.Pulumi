import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface LonghornResourcesComponentArgsShape {
  namespace: string;
  nodes: {
    hostName: string;
    disks: {
      name: string;
      path: string;
      tags: string[];
    }[];
  }[];
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type LonghornResourcesComponentArgs =
  utils.types.DeepPulumiInput<LonghornResourcesComponentArgsShape>;

interface LonghornStorageClassConfig {
  name: string;
  diskSelector: 'hdd' | 'ssd';
  rwx: boolean;
  reclaimPolicy: 'Delete' | 'Retain';
}

export const LonghornResourcesComponent = utils.functions.defineComponent(
  'longhornResources',
  (
    args: LonghornResourcesComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const nodePatches = pulumi.output(args.nodes).apply(resolvedNodes => {
      return resolvedNodes.map(eachResolvedNode => {
        const disks = Object.fromEntries(
          eachResolvedNode.disks.map(eachDisk => {
            const diskSpec: customResources.resources.k8s.crd.longhorn.NodeV1DiskSpecShape =
              {
                path: eachDisk.path,
                tags: eachDisk.tags,
                diskType: 'filesystem',
                allowScheduling: true,
              };
            return [eachDisk.name, diskSpec];
          }),
        );
        return new customResources.resources.k8s.crd.longhorn.NodeV1Patch(
          `${resourceName}-${eachResolvedNode.hostName}`,
          {
            metadata: {
              name: eachResolvedNode.hostName,
              namespace: args.namespace,
            },
            spec: {
              disks,
            },
          },
          {
            ...opts,
            provider: args.providers.kubernetes,
          },
        );
      });
    });

    const createLonghornStorageClass = (config: LonghornStorageClassConfig) => {
      const parameters: Record<string, string> = {
        numberOfReplicas: '1',
        diskSelector: config.diskSelector,
        fsType: 'ext4',
      };

      if (config.rwx) {
        parameters.nfsOptions = 'vers=4.2,noresvport,softerr';
      }

      return new kubernetes.storage.v1.StorageClass(
        `${resourceName}-${config.name}`,
        {
          metadata: {
            name: config.name,
          },
          provisioner: 'driver.longhorn.io',
          allowVolumeExpansion: true,
          reclaimPolicy: config.reclaimPolicy,
          parameters,
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );
    };

    const storageClasses = {
      longhornHdd: createLonghornStorageClass({
        name: 'longhorn-hdd',
        diskSelector: 'hdd',
        rwx: false,
        reclaimPolicy: 'Delete',
      }),
      longhornHddRetain: createLonghornStorageClass({
        name: 'longhorn-hdd-retain',
        diskSelector: 'hdd',
        rwx: false,
        reclaimPolicy: 'Retain',
      }),
      longhornHddRwx: createLonghornStorageClass({
        name: 'longhorn-hdd-rwx',
        diskSelector: 'hdd',
        rwx: true,
        reclaimPolicy: 'Delete',
      }),
      longhornHddRwxRetain: createLonghornStorageClass({
        name: 'longhorn-hdd-rwx-retain',
        diskSelector: 'hdd',
        rwx: true,
        reclaimPolicy: 'Retain',
      }),
      longhornSsd: createLonghornStorageClass({
        name: 'longhorn-ssd',
        diskSelector: 'ssd',
        rwx: false,
        reclaimPolicy: 'Delete',
      }),
      longhornSsdRetain: createLonghornStorageClass({
        name: 'longhorn-ssd-retain',
        diskSelector: 'ssd',
        rwx: false,
        reclaimPolicy: 'Retain',
      }),
      longhornSsdRwx: createLonghornStorageClass({
        name: 'longhorn-ssd-rwx',
        diskSelector: 'ssd',
        rwx: true,
        reclaimPolicy: 'Delete',
      }),
      longhornSsdRwxRetain: createLonghornStorageClass({
        name: 'longhorn-ssd-rwx-retain',
        diskSelector: 'ssd',
        rwx: true,
        reclaimPolicy: 'Retain',
      }),
    };

    return {
      output: pulumi.output({
        nodePatches,
        storageClasses: {
          longhornHdd: storageClasses.longhornHdd.metadata.name,
          longhornHddRetain: storageClasses.longhornHddRetain.metadata.name,
          longhornHddRwx: storageClasses.longhornHddRwx.metadata.name,
          longhornHddRwxRetain:
            storageClasses.longhornHddRwxRetain.metadata.name,
          longhornSsd: storageClasses.longhornSsd.metadata.name,
          longhornSsdRetain: storageClasses.longhornSsdRetain.metadata.name,
          longhornSsdRwx: storageClasses.longhornSsdRwx.metadata.name,
          longhornSsdRwxRetain:
            storageClasses.longhornSsdRwxRetain.metadata.name,
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
