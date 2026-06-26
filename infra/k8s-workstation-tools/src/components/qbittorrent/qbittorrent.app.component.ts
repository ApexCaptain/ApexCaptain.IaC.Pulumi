import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import dedent from 'dedent';
import Timezone from 'timezone-enum';

interface QbittorrentAppComponentArgsShape {
  nordLynx: {
    allowedCidrBlocks: string[];
    privateKey: string;
  };
  sftpUserName: string;
  directGateway: {
    gatewayPath: string;
    qbitorrentSftp: {
      port: number;
    };
  };
  pvc: {
    qbittorrentModCache: {
      storageClass: string;
      size: string;
    };
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
            'istio.io/dataplane-mode': 'none',
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
    const qbittorrentModCachePvc = new kubernetes.core.v1.PersistentVolumeClaim(
      `${resourceName}-qbittorrentModCachePvc`,
      {
        metadata: {
          name: 'qbittorrent-modcache',
          namespace: namespace.metadata.name,
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          storageClassName: args.pvc.qbittorrentModCache.storageClass,
          resources: {
            requests: {
              storage: args.pvc.qbittorrentModCache.size,
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

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
    const qbittorrentUid = 1000;
    const qbittorrentGid = 1000;
    const qbittorrentWebUiPort = 8080;
    const qbittorrentModCacheVolumeName = 'qbittorrent-modcache';
    const qbittorrentConfigVolumeName = 'qbittorrent-config';
    const qbittorrentCompleteDownloadsVolumeName =
      'qbittorrent-complete-downloads';
    const qbittorrentIncompleteDownloadsVolumeName =
      'qbittorrent-incomplete-downloads';
    const sftpAdapterPort = 22;
    const tunDeviceVolumeName = 'tun-device';

    const gluetunStateVolumeName = 'gluetun-state';

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

    // Sftp Adapter
    const sftpAdapter = new customResources.components.adapter.SftpV1Component(
      'sftpAdapter',
      {
        username: args.sftpUserName,
        namespace: namespace.metadata.name,
        targetLabels: qbittorrentLabel,
        uid: qbittorrentUid,
        gid: 0,
        volumeMounts: [
          {
            pvcVolumeName: qbittorrentConfigVolumeName,
            homeDirName: 'config',
          },
          {
            pvcVolumeName: qbittorrentCompleteDownloadsVolumeName,
            homeDirName: 'downloads',
          },
          {
            pvcVolumeName: qbittorrentIncompleteDownloadsVolumeName,
            homeDirName: 'incomplete',
          },
        ],
        directGateway: {
          gatewayPath: args.directGateway.gatewayPath,
          port: args.directGateway.qbitorrentSftp.port,
        },
        providers: {
          kubernetes: args.providers.kubernetes,
        },
      },
      {
        ...opts,
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
          strategy: {
            type: 'Recreate',
          },
          selector: {
            matchLabels: qbittorrentLabel,
          },
          template: {
            metadata: {
              labels: qbittorrentLabel,
            },
            spec: {
              terminationGracePeriodSeconds: 60,
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
                      sysctl -w net.ipv4.conf.all.src_valid_mark=1
                      sysctl -w net.ipv6.conf.all.disable_ipv6=1
                    `,
                  ],
                  securityContext: {
                    privileged: true,
                  },
                },
                {
                  // K8s native sidecar: VPN must be up before qbittorrent starts
                  name: 'gluetun',
                  image: 'qmcgaw/gluetun:v3.41.1',
                  imagePullPolicy: 'Always',
                  restartPolicy: 'Always',
                  env: [
                    {
                      name: 'TZ',
                      value: Timezone['Asia/Seoul'],
                    },
                    {
                      name: 'VPN_SERVICE_PROVIDER',
                      value: 'nordvpn',
                    },
                    {
                      name: 'VPN_TYPE',
                      value: 'wireguard',
                    },
                    {
                      name: 'WIREGUARD_PRIVATE_KEY',
                      valueFrom: {
                        secretKeyRef: {
                          name: nordLynxPrivateKeySecret.metadata.name,
                          key: nordLynxPrivateKeySecretDataKey,
                        },
                      },
                    },
                    {
                      name: 'SERVER_COUNTRIES',
                      value: 'Japan',
                    },
                    {
                      name: 'SERVER_CATEGORIES',
                      value: 'P2P',
                    },
                    {
                      name: 'FIREWALL_OUTBOUND_SUBNETS',
                      value: pulumi
                        .output(args.nordLynx.allowedCidrBlocks)
                        .apply(cidrBlocks => cidrBlocks.join(',')),
                    },
                    {
                      name: 'FIREWALL_INPUT_PORTS',
                      value: `${qbittorrentWebUiPort.toString()},${sftpAdapterPort.toString()}`,
                    },
                    {
                      // NordVPN does not support port forwarding; use DoT DNS
                      // instead of plain UDP to avoid firewall/DNS leaks.
                      name: 'DNS_UPSTREAM_RESOLVER_TYPE',
                      value: 'dot',
                    },
                    {
                      name: 'DNS_UPSTREAM_RESOLVERS',
                      value: 'cloudflare,google',
                    },
                    {
                      name: 'DNS_UPSTREAM_IPV6',
                      value: 'off',
                    },
                    {
                      name: 'FIREWALL',
                      value: 'on',
                    },
                  ],
                  volumeMounts: [
                    {
                      name: tunDeviceVolumeName,
                      mountPath: '/dev/net/tun',
                    },
                    {
                      name: gluetunStateVolumeName,
                      mountPath: '/tmp/gluetun',
                    },
                  ],
                  securityContext: {
                    capabilities: {
                      add: ['NET_ADMIN'],
                    },
                    allowPrivilegeEscalation: true,
                  },
                  startupProbe: {
                    exec: {
                      command: [
                        '/bin/sh',
                        '-c',
                        'wget -qO- http://127.0.0.1:9999/ > /dev/null',
                      ],
                    },
                    initialDelaySeconds: 5,
                    periodSeconds: 5,
                    failureThreshold: 30,
                  },
                  readinessProbe: {
                    exec: {
                      command: [
                        '/bin/sh',
                        '-c',
                        'wget -qO- http://127.0.0.1:9999/ > /dev/null',
                      ],
                    },
                    periodSeconds: 10,
                    failureThreshold: 3,
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
                      value: qbittorrentUid.toString(),
                    },
                    {
                      name: 'PGID',
                      value: qbittorrentGid.toString(),
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
                      name: qbittorrentModCacheVolumeName,
                      mountPath: '/modcache',
                    },
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
                  startupProbe: {
                    tcpSocket: {
                      port: qbittorrentWebUiPort,
                    },
                    initialDelaySeconds: 10,
                    periodSeconds: 5,
                    failureThreshold: 12,
                  },
                  livenessProbe: {
                    tcpSocket: {
                      port: qbittorrentWebUiPort,
                    },
                    periodSeconds: 15,
                    failureThreshold: 3,
                  },
                },

                sftpAdapter.output.spec.containerSpec,
              ],
              volumes: [
                {
                  name: tunDeviceVolumeName,
                  hostPath: {
                    path: '/dev/net/tun',
                    type: 'CharDevice',
                  },
                },
                {
                  name: gluetunStateVolumeName,
                  emptyDir: {},
                },
                {
                  name: qbittorrentModCacheVolumeName,
                  persistentVolumeClaim: {
                    claimName: qbittorrentModCachePvc.metadata.name,
                  },
                },
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
                sftpAdapter.output.spec.volumeSpec,
              ],
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [
          qbittorrentModCachePvc,
          qbittorrentConfigPvc,
          qbittorrentCompleteDownloadsPvc,
          qbittorrentIncompleteDownloadsPvc,
          sftpAdapter,
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
