import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface JellyfinHelmChartComponentArgsShape {
  helm: {
    jellyfin: {
      version: string;
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
            'istio-injection': 'enabled',
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

    const serviceName = 'jellyfin';
    const serviceAccountName = 'jellyfin';
    const customPodLabelKey = 'jellyfin.custom-pod-label';
    const customPodLabelValue = 'jellyfin';
    const webServicePort = 8096;

    const jellyfinHelmChartRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-jellyfinHelmChartRelease`,
      {
        name: 'jellyfin',
        chart: 'jellyfin',
        version: args.helm.jellyfin.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: 'https://jellyfin.github.io/jellyfin-helm',
        },
        waitForJobs: true,
        values: {
          image: {
            pullPolicy: 'Always',
          },
          serviceAccount: {
            name: serviceAccountName,
          },
          podLabels: {
            [customPodLabelKey]: customPodLabelValue,
          },
          runtimeClassName: 'nvidia',
          persistence: {
            config: {
              existingClaim: jellyfinConfigPvc.metadata.name,
            },
            media: {
              existingClaim: jeyllfinMediaPvc.metadata.name,
            },
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
