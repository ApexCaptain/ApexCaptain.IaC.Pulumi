import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface JellyfinHelmChartComponentArgsShape {
  namespace: string;
  version: string;
  jellyfinDomain: string;
  ingressGatewayPath: string;
  ssdStorageClassName: string;
  hddStorageClassName: string;
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
          name: args.namespace,
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
          storageClassName: args.ssdStorageClassName,
          resources: {
            requests: {
              storage: '10Gi',
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
          storageClassName: args.hddStorageClassName,
          resources: {
            requests: {
              storage: '2Ti',
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
        version: args.version,
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

    const jellyfinVirtualService =
      new customResources.resources.k8s.crd.istio.VirtualServiceV1(
        `${resourceName}-jellyfinVirtualService`,
        {
          metadata: {
            name: 'jellyfin',
            namespace: namespace.metadata.name,
          },
          spec: {
            hosts: [args.jellyfinDomain],
            gateways: [args.ingressGatewayPath],
            http: [
              {
                route: [
                  {
                    destination: {
                      host: serviceName,
                      port: {
                        number: webServicePort,
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
          dependsOn: [jellyfinHelmChartRelease, namespace],
        },
      );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
