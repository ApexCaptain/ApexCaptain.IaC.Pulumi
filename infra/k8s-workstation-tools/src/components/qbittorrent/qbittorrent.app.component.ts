import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import dedent from 'dedent';
import Timezone from 'timezone-enum';

interface QbittorrentAppComponentArgsShape {
  nordLynx: {
    netLocal: string;
    privateKey: string;
  };
  pvc: {
    qbittorrentConfig: {
      storageClass: string;
      size: string;
    };
    qbittorrentCompleteDownloads: {
      storageClass: string;
      size: string;
    };
    qbittorrentIncompleteDownloads: {
      storageClass: string;
      size: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type QbittorrentAppComponentArgs =
  utils.types.DeepPulumiInput<QbittorrentAppComponentArgsShape>;

export const QbittorrentAppComponent = utils.functions.defineComponent(
  'qbittorrent',
  (
    args: QbittorrentAppComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'qbittorrent',
          labels: {
            'istio-injection': 'disabled',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // Secrets
    const nordLynxPrivateKeySecretDataKey = 'nord-lynx-private-key';
    const nordLynxPrivateKeySecret = new kubernetes.core.v1.Secret(
      `${resourceName}-nordLynxPrivateKeySecret`,
      {
        metadata: {
          name: 'nord-lynx-private-key',
          namespace: namespace.metadata.name,
        },
        stringData: {
          [nordLynxPrivateKeySecretDataKey]: args.nordLynx.privateKey,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // PVCs
    const qbittorrentConfigPvc = new kubernetes.core.v1.PersistentVolumeClaim(
      `${resourceName}-qbittorrentConfigPvc`,
      {
        metadata: {
          name: 'qbittorrent-config',
          namespace: namespace.metadata.name,
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          storageClassName: args.pvc.qbittorrentConfig.storageClass,
          resources: {
            requests: {
              storage: args.pvc.qbittorrentConfig.size,
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const qbittorrentCompleteDownloadsPvc =
      new kubernetes.core.v1.PersistentVolumeClaim(
        `${resourceName}-qbittorrentCompleteDownloadsPvc`,
        {
          metadata: {
            name: 'qbittorrent-complete-downloads',
            namespace: namespace.metadata.name,
          },
          spec: {
            accessModes: ['ReadWriteOnce'],
            storageClassName:
              args.pvc.qbittorrentCompleteDownloads.storageClass,
            resources: {
              requests: {
                storage: args.pvc.qbittorrentCompleteDownloads.size,
              },
            },
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    const qbittorrentIncompleteDownloadsPvc =
      new kubernetes.core.v1.PersistentVolumeClaim(
        `${resourceName}-qbittorrentIncompleteDownloadsPvc`,
        {
          metadata: {
            name: 'qbittorrent-incomplete-downloads',
            namespace: namespace.metadata.name,
          },
          spec: {
            accessModes: ['ReadWriteOnce'],
            storageClassName:
              args.pvc.qbittorrentIncompleteDownloads.storageClass,
            resources: {
              requests: {
                storage: args.pvc.qbittorrentIncompleteDownloads.size,
              },
            },
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    // Configurations
    const qbittorrentLabel = {
      'app.kubernetes.io/name': 'qbittorrent',
    };
    const qbittorrentWebUiPort = 8080;
    const qbittorrentConfigVolumeName = 'qbittorrent-config';
    const qbittorrentCompleteDownloadsVolumeName =
      'qbittorrent-complete-downloads';
    const qbittorrentIncompleteDownloadsVolumeName =
      'qbittorrent-incomplete-downloads';

    // Service
    const qbittorrentService = new kubernetes.core.v1.Service(
      `${resourceName}-qbittorrentService`,
      {
        metadata: {
          name: 'qbittorrent',
          namespace: namespace.metadata.name,
        },
        spec: {
          selector: qbittorrentLabel,
          ports: [
            {
              port: qbittorrentWebUiPort,
              targetPort: qbittorrentWebUiPort,
            },
          ],
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // Deployment
    const qbittorrentDeployment = new kubernetes.apps.v1.Deployment(
      `${resourceName}-qbittorrentDeployment`,
      {
        metadata: {
          name: 'qbittorrent',
          namespace: namespace.metadata.name,
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: qbittorrentLabel,
          },
          template: {
            metadata: {
              labels: qbittorrentLabel,
            },
            spec: {
              securityContext: {
                fsGroup: 1000,
              },
              initContainers: [
                {
                  name: 'init-sysctl',
                  image: 'busybox',
                  command: [
                    '/bin/sh',
                    '-c',
                    dedent`
                      sysctl -w net.ipv6.conf.all.disable_ipv6=1
                      sysctl -w net.ipv4.conf.all.src_valid_mark=1
                    `,
                  ],
                  securityContext: {
                    privileged: true,
                  },
                },
              ],
              containers: [
                {
                  name: 'qbittorrent',
                  image: 'lscr.io/linuxserver/qbittorrent:amd64-5.1.4-r3-ls451',
                  imagePullPolicy: 'Always',
                  ports: [
                    {
                      containerPort: qbittorrentWebUiPort,
                      protocol: 'TCP',
                    },
                  ],
                  env: [
                    {
                      name: 'PUID',
                      value: '1000',
                    },
                    {
                      name: 'PGID',
                      value: '1000',
                    },
                    {
                      name: 'TZ',
                      value: Timezone['Asia/Seoul'],
                    },
                    {
                      name: 'WEBUI_PORT',
                      value: qbittorrentWebUiPort.toString(),
                    },
                    {
                      name: 'DOCKER_MODS',
                      value: 'ghcr.io/gabe565/linuxserver-mod-vuetorrent',
                    },
                  ],
                  volumeMounts: [
                    {
                      name: qbittorrentConfigVolumeName,
                      mountPath: '/config',
                    },
                    {
                      name: qbittorrentCompleteDownloadsVolumeName,
                      mountPath: '/downloads',
                    },
                    {
                      name: qbittorrentIncompleteDownloadsVolumeName,
                      mountPath: '/incomplete',
                    },
                  ],
                  // livenessProbe: {
                  //   exec: {
                  //     command: [
                  //       '/bin/sh',
                  //       '-c',
                  //       dedent`
                  //         curl -fsS http://localhost:${qbittorrentWebUiPort}
                  //       `,
                  //     ],
                  //   },
                  //   initialDelaySeconds: 30,
                  //   timeoutSeconds: 5,
                  //   periodSeconds: 15,
                  //   successThreshold: 1,
                  //   failureThreshold: 3,
                  // },
                },
                {
                  name: 'nordlynx',
                  image: 'ghcr.io/bubuntux/nordlynx:latest',
                  imagePullPolicy: 'Always',
                  env: [
                    {
                      name: 'TZ',
                      value: Timezone['Asia/Seoul'],
                    },
                    {
                      name: 'NET_LOCAL',
                      value: args.nordLynx.netLocal,
                    },
                    {
                      name: 'ALLOW_LIST',
                      value: pulumi.interpolate`${qbittorrentService.metadata.name}.${namespace.metadata.name}.svc.cluster.local`,
                    },
                    {
                      name: 'DNS',
                      value: '1.1.1.1,8.8.8.8',
                    },
                    {
                      name: 'PRIVATE_KEY',
                      valueFrom: {
                        secretKeyRef: {
                          name: nordLynxPrivateKeySecret.metadata.name,
                          key: nordLynxPrivateKeySecretDataKey,
                        },
                      },
                    },
                    {
                      name: 'QUERY',
                      value:
                        'filters\\[servers_groups\\]\\[identifier\\]=legacy_p2p',
                    },
                    {
                      name: 'COUNTRY_CODE',
                      value: 'JP',
                    },
                  ],
                  securityContext: {
                    capabilities: {
                      add: ['NET_ADMIN'],
                    },
                  },
                },
              ],
              volumes: [
                {
                  name: qbittorrentConfigVolumeName,
                  persistentVolumeClaim: {
                    claimName: qbittorrentConfigPvc.metadata.name,
                  },
                },
                {
                  name: qbittorrentCompleteDownloadsVolumeName,
                  persistentVolumeClaim: {
                    claimName: qbittorrentCompleteDownloadsPvc.metadata.name,
                  },
                },
                {
                  name: qbittorrentIncompleteDownloadsVolumeName,
                  persistentVolumeClaim: {
                    claimName: qbittorrentIncompleteDownloadsPvc.metadata.name,
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
        dependsOn: [
          qbittorrentConfigPvc,
          qbittorrentCompleteDownloadsPvc,
          qbittorrentIncompleteDownloadsPvc,
        ],
      },
    );

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
        services: {
          qbittorrent: {
            name: qbittorrentService.metadata.name,
            port: {
              webUi: qbittorrentWebUiPort,
            },
          },
        },
      }),
      secret: pulumi.output({}),
    };
  },
);
