import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface JellyfinHelmChartComponentArgsShape {
  helm: {
    jellyfin: {
      version: string;
      repositoryUrl: string;
    };
  };
  sftpUserName: string;
  directGateway: {
    gatewayPath: string;
    jellyfinSftp: {
      port: number;
    };
  };
  pvc: {
    jellyfinConfig: {
      storageClass: string;
      size: string;
    };
    jellyfinMedia: {
      storageClass: string;
      size: string;
    };
    jellyfinCache: {
      storageClass: string;
      size: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type JellyfinHelmChartComponentArgs =
  utils.types.DeepPulumiInput<JellyfinHelmChartComponentArgsShape>;

export const JellyfinHelmChartComponent = utils.functions.defineComponent(
  'jellyfinHelmChart',
  (
    args: JellyfinHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'jellyfin',
          labels: {
            'istio.io/dataplane-mode': 'ambient',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // PVCs
    const jellyfinConfigPvc = new kubernetes.core.v1.PersistentVolumeClaim(
      `${resourceName}-jellyfinConfigPvc`,
      {
        metadata: {
          name: 'jellyfin-config',
          namespace: namespace.metadata.name,
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          storageClassName: args.pvc.jellyfinConfig.storageClass,
          resources: {
            requests: {
              storage: args.pvc.jellyfinConfig.size,
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const jeyllfinMediaPvc = new kubernetes.core.v1.PersistentVolumeClaim(
      `${resourceName}-jellyfinMediaPvc`,
      {
        metadata: {
          name: 'jellyfin-media',
          namespace: namespace.metadata.name,
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          storageClassName: args.pvc.jellyfinMedia.storageClass,
          resources: {
            requests: {
              storage: args.pvc.jellyfinMedia.size,
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const jeyllfinCachePvc = new kubernetes.core.v1.PersistentVolumeClaim(
      `${resourceName}-jellyfinCachePvc`,
      {
        metadata: {
          name: 'jellyfin-cache',
          namespace: namespace.metadata.name,
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          storageClassName: args.pvc.jellyfinCache.storageClass,
          resources: {
            requests: {
              storage: args.pvc.jellyfinCache.size,
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const serviceName = 'jellyfin';
    const serviceAccountName = 'jellyfin';
    const customPodLabelKey = 'jellyfin.custom-pod-label';
    const customPodLabelValue = 'jellyfin';
    const webServicePort = 8096;
    const userId = 1000;
    const groupId = 1000;

    const sftpAdapter = new customResources.components.adapter.SftpV1Component(
      'sftpAdapter',
      {
        username: args.sftpUserName,
        namespace: namespace.metadata.name,
        targetLabels: {
          [customPodLabelKey]: customPodLabelValue,
        },
        uid: userId,
        gid: groupId,
        volumeMounts: [
          {
            pvcVolumeName: 'config',
            homeDirName: 'config',
          },
          {
            pvcVolumeName: 'media',
            homeDirName: 'media',
          },
        ],
        directGateway: {
          gatewayPath: args.directGateway.gatewayPath,
          port: args.directGateway.jellyfinSftp.port,
        },
        providers: {
          kubernetes: args.providers.kubernetes,
        },
      },
      {
        ...opts,
      },
    );

    const jellyfinHelmChartRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-jellyfinHelmChartRelease`,
      {
        name: 'jellyfin',
        chart: 'jellyfin',
        version: args.helm.jellyfin.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.jellyfin.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          image: {
            pullPolicy: 'Always',
          },
          podSecurityContext: {
            fsGroup: groupId,
          },
          securityContext: {
            runAsUser: userId,
            runAsGroup: groupId,
            runAsNonRoot: true,
          },
          serviceAccount: {
            name: serviceAccountName,
          },
          podLabels: {
            [customPodLabelKey]: customPodLabelValue,
          },
          // @Note 나중에 GPU Operator 설치 후 사용
          // runtimeClassName: 'nvidia',
          persistence: {
            config: {
              existingClaim: jellyfinConfigPvc.metadata.name,
            },
            media: {
              existingClaim: jeyllfinMediaPvc.metadata.name,
            },
            cache: {
              enabled: true,
              existingClaim: jeyllfinCachePvc.metadata.name,
            },
          },
          volumes: [sftpAdapter.output.spec.volumeSpec],
          extraContainers: [sftpAdapter.output.spec.containerSpec],
        },
      },
      {
        ...opts,
        dependsOn: [sftpAdapter],
        provider: args.providers.kubernetes,
      },
    );

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
        services: {
          jellyfin: {
            name: serviceName,
            port: {
              webUi: webServicePort,
            },
          },
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
