import path from 'path';
import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import dedent from 'dedent';

interface LocalNfsProvisionerBaseComponentArgsShape {
  nodes: {
    node0: {
      hostName: string;
    };
  };

  hostPath: {
    localPathHdd0: string;
    localPathSsd0: string;
    diskSizeHdd0: string;
    diskSizeSsd0: string;
  };
  sftp: {
    userName: string;
    externalPort: number;
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type LocalNfsProvisionerBaseComponentArgs =
  utils.types.DeepPulumiInput<LocalNfsProvisionerBaseComponentArgsShape>;

export const LocalNfsProvisionerBaseComponent = utils.functions.defineComponent(
  'localNfsProvisionerBase',
  (
    args: LocalNfsProvisionerBaseComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'local-nfs-provisioner',
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // PVs
    const hdd0StorageClassName = 'microk8s-custom-hdd0';
    const hdd0Pv = new kubernetes.core.v1.PersistentVolume(
      `${resourceName}-hdd0Pv`,
      {
        metadata: {
          name: `${utils.functions.kebabCase(resourceName)}-hdd0`,
        },
        spec: {
          capacity: {
            storage: args.hostPath.diskSizeHdd0,
          },
          volumeMode: 'Filesystem',
          accessModes: ['ReadWriteOnce'],
          persistentVolumeReclaimPolicy: 'Retain',
          storageClassName: hdd0StorageClassName,
          local: {
            path: args.hostPath.localPathHdd0,
          },
          nodeAffinity: {
            required: {
              nodeSelectorTerms: [
                {
                  matchExpressions: [
                    {
                      key: 'kubernetes.io/hostname',
                      operator: 'In',
                      values: [args.nodes.node0.hostName],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const ssd0StorageClassName = 'microk8s-custom-ssd0';
    const ssd0Pv = new kubernetes.core.v1.PersistentVolume(
      `${resourceName}-ssd0Pv`,
      {
        metadata: {
          name: `${utils.functions.kebabCase(resourceName)}-ssd0`,
        },
        spec: {
          capacity: {
            storage: args.hostPath.diskSizeSsd0,
          },
          volumeMode: 'Filesystem',
          accessModes: ['ReadWriteOnce'],
          persistentVolumeReclaimPolicy: 'Retain',
          storageClassName: ssd0StorageClassName,
          local: {
            path: args.hostPath.localPathSsd0,
          },
          nodeAffinity: {
            required: {
              nodeSelectorTerms: [
                {
                  matchExpressions: [
                    {
                      key: 'kubernetes.io/hostname',
                      operator: 'In',
                      values: [args.nodes.node0.hostName],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // PVCs
    const hdd0Pvc = new kubernetes.core.v1.PersistentVolumeClaim(
      `${resourceName}-hdd0Pvc`,
      {
        metadata: {
          name: 'hdd0',
          namespace: namespace.metadata.name,
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          storageClassName: hdd0StorageClassName,
          resources: {
            requests: {
              storage: args.hostPath.diskSizeHdd0,
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [hdd0Pv],
      },
    );

    const ssd0Pvc = new kubernetes.core.v1.PersistentVolumeClaim(
      `${resourceName}-ssd0Pvc`,
      {
        metadata: {
          name: 'ssd0',
          namespace: namespace.metadata.name,
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          storageClassName: ssd0StorageClassName,
          resources: {
            requests: {
              storage: args.hostPath.diskSizeSsd0,
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [ssd0Pv],
      },
    );

    // Common Nfs Configuration
    const nfsStoragePath = '/exports';
    const nfsSharedServiceDirName = 'services';
    const nfsSharedServiceDirPath = path.join(
      nfsStoragePath,
      nfsSharedServiceDirName,
    );
    const nfsStorageVolumeName = 'nfs-storage';
    const nfsPort = 2049;

    // NFS Server
    // HDD 0
    const hdd0NfsServerLabel = {
      'app.kubernetes.io/name': 'hdd0-nfs-server',
    };
    const hdd0NfsServerDeployment = new kubernetes.apps.v1.Deployment(
      `${resourceName}-hdd0NfsServerDeployment`,
      {
        metadata: {
          name: 'hdd0-nfs-server',
          namespace: namespace.metadata.name,
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: hdd0NfsServerLabel,
          },
          template: {
            metadata: {
              labels: hdd0NfsServerLabel,
            },
            spec: {
              containers: [
                {
                  name: 'nfs-server',
                  image: 'itsthenetwork/nfs-server-alpine:12',
                  imagePullPolicy: 'Always',
                  ports: [
                    {
                      containerPort: nfsPort,
                      protocol: 'TCP',
                    },
                  ],
                  securityContext: {
                    privileged: true,
                  },
                  command: [
                    '/bin/sh',
                    '-c',
                    `mkdir -p ${nfsSharedServiceDirPath} && /usr/bin/nfsd.sh`,
                  ],
                  volumeMounts: [
                    {
                      name: nfsStorageVolumeName,
                      mountPath: nfsStoragePath,
                    },
                  ],
                  env: [
                    {
                      name: 'SHARED_DIRECTORY',
                      value: nfsStoragePath,
                    },
                    {
                      name: 'SHARED_DIRECTORY_2',
                      value: nfsSharedServiceDirPath,
                    },
                  ],
                },
              ],
              volumes: [
                {
                  name: nfsStorageVolumeName,
                  persistentVolumeClaim: {
                    claimName: hdd0Pvc.metadata.name,
                  },
                },
              ],
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [hdd0Pvc],
      },
    );
    const hdd0NfsServerService = new kubernetes.core.v1.Service(
      `${resourceName}-hdd0NfsServerService`,
      {
        metadata: {
          name: 'hdd0-nfs-server',
          namespace: namespace.metadata.name,
        },
        spec: {
          selector: hdd0NfsServerLabel,
          ports: [
            {
              port: nfsPort,
              targetPort: nfsPort,
            },
          ],
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // SSD 0
    const ssd0NfsServerLabel = {
      'app.kubernetes.io/name': 'ssd0-nfs-server',
    };
    const ssd0NfsServerDeployment = new kubernetes.apps.v1.Deployment(
      `${resourceName}-ssd0NfsServerDeployment`,
      {
        metadata: {
          name: 'ssd0-nfs-server',
          namespace: namespace.metadata.name,
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: ssd0NfsServerLabel,
          },
          template: {
            metadata: {
              labels: ssd0NfsServerLabel,
            },
            spec: {
              containers: [
                {
                  name: 'nfs-server',
                  image: 'itsthenetwork/nfs-server-alpine:12',
                  imagePullPolicy: 'Always',
                  ports: [
                    {
                      containerPort: nfsPort,
                      protocol: 'TCP',
                    },
                  ],
                  securityContext: {
                    privileged: true,
                  },
                  command: [
                    '/bin/sh',
                    '-c',
                    `mkdir -p ${nfsSharedServiceDirPath} && /usr/bin/nfsd.sh`,
                  ],
                  volumeMounts: [
                    {
                      name: nfsStorageVolumeName,
                      mountPath: nfsStoragePath,
                    },
                  ],
                  env: [
                    {
                      name: 'SHARED_DIRECTORY',
                      value: nfsStoragePath,
                    },
                    {
                      name: 'SHARED_DIRECTORY_2',
                      value: nfsSharedServiceDirPath,
                    },
                  ],
                },
              ],
              volumes: [
                {
                  name: nfsStorageVolumeName,
                  persistentVolumeClaim: {
                    claimName: ssd0Pvc.metadata.name,
                  },
                },
              ],
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [ssd0Pvc],
      },
    );

    const ssd0NfsServerService = new kubernetes.core.v1.Service(
      `${resourceName}-ssd0NfsServerService`,
      {
        metadata: {
          name: 'ssd0-nfs-server',
          namespace: namespace.metadata.name,
        },
        spec: {
          selector: ssd0NfsServerLabel,
          ports: [
            {
              port: nfsPort,
              targetPort: nfsPort,
            },
          ],
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // SFTP
    const sftpPrivateKey =
      new customResources.components.tls.PrivateKeyV1Component(
        `${resourceName}-sftpPrivateKey`,
        {
          expirationDateString: utils.functions
            .createExpirationInterval({
              days: 30,
            })
            .toISOString(),
          createKeyFile: true,
        },
        {
          ...opts,
        },
      );

    const sftpConfigMap = new kubernetes.core.v1.ConfigMap(
      `${resourceName}-sftpConfigMap`,
      {
        metadata: {
          name: 'sftp-config',
          namespace: namespace.metadata.name,
        },
        data: {
          'ssh-public-key': sftpPrivateKey.secret.publicKeyOpenSsh,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [sftpPrivateKey],
      },
    );

    const sftpLabel = {
      'app.kubernetes.io/name': 'sftp-server',
    };
    const sftpDataDirName = 'data';
    const sftpHomeDirContainerPath = pulumi
      .output(args.sftp.userName)
      .apply(resolvedSftpUserName => {
        return path.join('/home', resolvedSftpUserName);
      });
    const sftpDataDirContainerPath = pulumi
      .output(sftpHomeDirContainerPath)
      .apply(resolvedSftpHomeDirContainerPath => {
        return path.join(resolvedSftpHomeDirContainerPath, sftpDataDirName);
      });
    const sftpPort = 22;
    const sftpConfigMapVolumeName = 'sftp-config-volume';
    const sftpSsd0VolumeName = 'sftp-ssd0-volume';
    const sftpHdd0VolumeName = 'sftp-hdd0-volume';
    const sftpDeployment = new kubernetes.apps.v1.Deployment(
      `${resourceName}-sftpDeployment`,
      {
        metadata: {
          name: 'sftp-server',
          namespace: namespace.metadata.name,
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: sftpLabel,
          },
          template: {
            metadata: {
              labels: sftpLabel,
            },
            spec: {
              containers: [
                {
                  name: 'sftp-server',
                  image: 'atmoz/sftp:alpine',
                  imagePullPolicy: 'Always',
                  command: [
                    'sh',
                    '-c',
                    pulumi
                      .all([sftpDataDirContainerPath, args.sftp.userName])
                      .apply(
                        ([
                          resolvedSftpDataDirContainerPath,
                          resolvedSftpUserName,
                        ]) => {
                          return dedent`
                            chmod o+w ${resolvedSftpDataDirContainerPath}
                            /entrypoint ${resolvedSftpUserName}::::${sftpDataDirName}
                          `;
                        },
                      ),
                  ],
                  ports: [
                    {
                      containerPort: sftpPort,
                      protocol: 'TCP',
                    },
                  ],
                  volumeMounts: [
                    {
                      mountPath: pulumi
                        .output(sftpHomeDirContainerPath)
                        .apply(resolvedSftpHomeDirContainerPath => {
                          return path.join(
                            resolvedSftpHomeDirContainerPath,
                            '.ssh',
                            'keys',
                          );
                        }),
                      name: sftpConfigMapVolumeName,
                      readOnly: true,
                    },
                    {
                      mountPath: pulumi
                        .output(sftpDataDirContainerPath)
                        .apply(resolvedSftpDataDirContainerPath => {
                          return path.join(
                            resolvedSftpDataDirContainerPath,
                            'hdd0',
                          );
                        }),
                      name: sftpHdd0VolumeName,
                    },
                    {
                      mountPath: pulumi
                        .output(sftpDataDirContainerPath)
                        .apply(resolvedSftpDataDirContainerPath => {
                          return path.join(
                            resolvedSftpDataDirContainerPath,
                            'ssd0',
                          );
                        }),
                      name: sftpSsd0VolumeName,
                    },
                  ],
                },
              ],
              volumes: [
                {
                  name: sftpConfigMapVolumeName,
                  configMap: {
                    name: sftpConfigMap.metadata.name,
                  },
                },
                {
                  name: sftpHdd0VolumeName,
                  persistentVolumeClaim: {
                    claimName: hdd0Pvc.metadata.name,
                  },
                },
                {
                  name: sftpSsd0VolumeName,
                  persistentVolumeClaim: {
                    claimName: ssd0Pvc.metadata.name,
                  },
                },
              ],
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [hdd0Pvc, ssd0Pvc, sftpConfigMap],
      },
    );

    const sftpService = new kubernetes.core.v1.Service(
      `${resourceName}-sftpService`,
      {
        metadata: {
          name: 'sftp-server',
          namespace: namespace.metadata.name,
        },
        spec: {
          selector: sftpLabel,
          ports: [
            {
              port: sftpPort,
              targetPort: sftpPort,
            },
          ],
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
        services: {
          sftp: {
            name: sftpService.metadata.name,
            port: {
              sftp: sftpPort,
            },
          },
        },
        nfsSharedServiceDirName,
        internalNfsServerIp: {
          hdd0: hdd0NfsServerService.spec.clusterIP,
          ssd0: ssd0NfsServerService.spec.clusterIP,
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
