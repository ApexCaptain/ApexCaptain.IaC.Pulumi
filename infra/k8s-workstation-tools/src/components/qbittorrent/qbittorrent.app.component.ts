/**
 * qBittorrent 앱 — NordLynx(WireGuard) VPN 사이드카 Pod
 *
 * ```
 * [Pod] qBittorrent ──► nordlynx (WireGuard) ──► 인터넷
 *       Web UI :8080  ◄── mesh ingress (VPN 밖에서 접근)
 * ```
 *
 * - 네임스페이스 `dataplane-mode: none`: VPN 라우팅이 Istio와 꼬이지 않도록 메시에서 제외
 * - DNS는 DoT(Cloudflare/Google)로 터널 안에서 처리해 ISP DNS 유출을 줄임
 * - gluetun은 K8s native sidecar(initContainers + restartPolicy: Always)로
 *   VPN이 뜬 뒤에야 qbittorrent/sftp가 시작되도록 함
 * - BitTorrent는 tun0에 바인드 (gluetun rule 100이 pod eth0 출구를
 *   killswitch DROP으로 막음 — eth0 bind 시 Stall)
 * - readiness는 WebUI만이 아니라 tun0·DHT·session 상태까지 검사
 */
import * as fs from 'fs';
import * as path from 'path';

import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
import dedent from 'dedent';
import Timezone from 'timezone-enum';

const bindVpnTun0Script = fs.readFileSync(
  path.join(__dirname, 'assets', '50-bind-vpn-tun0.sh'),
  'utf8',
);
const poststartBindTun0Script = fs.readFileSync(
  path.join(__dirname, 'assets', 'poststart-bind-tun0.sh'),
  'utf8',
);
const torrentReadyScript = fs.readFileSync(
  path.join(__dirname, 'assets', 'torrent-ready.sh'),
  'utf8',
);

interface QbittorrentAppComponentArgsShape {
  nordLynx: {
    allowedCidrBlocks: string[];
    privateKey: string;
  };
  sftpUserName: string;
  /** Vault SSH issue 키젠 + KV. 웹 SSO(Tools Manager)와 별개. KV read는 System User/Manager만. */
  sftp: {
    issuerGroupName: 'System User' | 'System Manager';
    issuerIdentityGroupId: string;
    hostPrincipals: string[];
    userCaMount: string;
    hostCaMount: string;
    kvMount: string;
    slackWebhookUrl: string;
    vaultConnectionRef: string;
    kubernetesAuthMountPath: string;
    vault: {
      address: string;
      tlsServerName: string;
      ca: {
        namespace: string;
        secretName: string;
      };
    };
  };
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
    vault: vault.Provider;
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
    // Istio Ambient 제외 — WireGuard/방화벽과 메시 프록시가 겹치면 안 됨
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'qbittorrent',
          labels: {
            'istio.io/dataplane-mode': 'none',
            'goldilocks.fairwinds.com/enabled': 'true',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        ...utils.configs.statefulResourceOptions,
      },
    );

    // NordLynx WireGuard 개인키 (projenrc에서 액세스 토큰 → API로 조회)
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

    // 영속 볼륨: VueTorrent 모드 캐시 / 설정 / 완료·미완료 다운로드
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
        ...utils.configs.statefulResourceOptions,
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
          ...utils.configs.statefulResourceOptions,
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

    // Pod/서비스 공통 상수
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
    // gluetun 런타임 상태(공인 IP 파일 등). emptyDir라 Pod 재생성 시 초기화됨
    const gluetunStateVolumeName = 'gluetun-state';
    const scriptsVolumeName = 'qbittorrent-scripts';
    const bindVpnTun0ScriptFileName = '50-bind-vpn-tun0.sh';
    const poststartBindTun0ScriptFileName = 'poststart-bind-tun0.sh';
    const torrentReadyScriptFileName = 'torrent-ready.sh';

    // LSIO cont-init + postStart + readiness (BT→tun0 강제, torrent 실동작 probe)
    const qbittorrentScriptsConfigMap = new kubernetes.core.v1.ConfigMap(
      `${resourceName}-scriptsConfigMap`,
      {
        metadata: {
          name: 'qbittorrent-scripts',
          namespace: namespace.metadata.name,
        },
        data: {
          [bindVpnTun0ScriptFileName]: bindVpnTun0Script,
          [poststartBindTun0ScriptFileName]: poststartBindTun0Script,
          [torrentReadyScriptFileName]: torrentReadyScript,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // WebUI용 ClusterIP 서비스 (메시 ingress → 여기로)
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

    // SFTP 사이드카 — Vault issue 키젠. 웹 SSO는 Tools Manager, KV read는 System Manager
    const qbittorrentSftpAdapter =
      new customResources.components.adapter.SftpV3Component(
        'qbittorrentSftpAdapter',
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
          hostPrincipals: args.sftp.hostPrincipals,
          issuerGroupName: args.sftp.issuerGroupName,
          issuerIdentityGroupId: args.sftp.issuerIdentityGroupId,
          userCaMount: args.sftp.userCaMount,
          hostCaMount: args.sftp.hostCaMount,
          kvMount: args.sftp.kvMount,
          slackWebhookUrl: args.sftp.slackWebhookUrl,
          vaultConnectionRef: args.sftp.vaultConnectionRef,
          kubernetesAuthMountPath: args.sftp.kubernetesAuthMountPath,
          vault: args.sftp.vault,
          providers: {
            kubernetes: args.providers.kubernetes,
            vault: args.providers.vault,
          },
        },
        {
          ...opts,
        },
      );

    // Deployment — gluetun(VPN) + qbittorrent + sftp 한 Pod에 묶음
    // Recreate: PVC ReadWriteOnce라 RollingUpdate 불가
    const qbittorrentDeployment = new kubernetes.apps.v1.Deployment(
      `${resourceName}-qbittorrentDeployment`,
      {
        metadata: {
          name: 'qbittorrent',
          namespace: namespace.metadata.name,
          annotations: {
            'secret.reloader.stakater.com/reload':
              qbittorrentSftpAdapter.output.userSecretName,
          },
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
                  // WireGuard 마크 라우팅용 커널 파라미터
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
                  resources: {
                    requests: {
                      cpu: '10m',
                      memory: '16Mi',
                    },
                    limits: {
                      cpu: '100m',
                      memory: '64Mi',
                    },
                  },
                },
                {
                  // native sidecar: VPN이 Ready여야 qbittorrent/sftp 시작
                  // (killswitch 켜진 동안 앱이 먼저 뜨면 외부 통신이 막힘)
                  name: 'gluetun',
                  // 버전 핀: floating :v3 금지 (라우팅/방화벽 회귀 위험)
                  image: utils.configs.containerImages.gluetun,
                  imagePullPolicy: 'IfNotPresent',
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
                      // 국가 OR 풀. Asia-only + P2P로 좁히면 핸드셰이크 실패
                      // (tun0 RX=0) 루프가 났던 적 있음 → 풀을 넓게 유지
                      // SERVER_CATEGORIES(P2P)는 의도적으로 넣지 않음
                      name: 'SERVER_COUNTRIES',
                      value:
                        'Japan,Taiwan,Singapore,Hong Kong,Netherlands,Germany,United Kingdom,United States',
                    },
                    {
                      // 클러스터 eth0 MTU(1450)보다 여유 있게
                      name: 'WIREGUARD_MTU',
                      value: '1280',
                    },
                    {
                      // 터널 정상화 후 Nord 서버 IP/공개키 목록 주기 갱신
                      name: 'UPDATER_PERIOD',
                      value: '24h',
                    },
                    {
                      // 클러스터 CIDR은 VPN 우회 허용 (kube DNS/서비스 통신)
                      name: 'FIREWALL_OUTBOUND_SUBNETS',
                      value: pulumi
                        .output(args.nordLynx.allowedCidrBlocks)
                        .apply(cidrBlocks => cidrBlocks.join(',')),
                    },
                    {
                      // WebUI·SFTP는 eth0로 인바운드 허용 (메시/SFTP 게이트웨이)
                      name: 'FIREWALL_INPUT_PORTS',
                      value: `${qbittorrentWebUiPort.toString()},${sftpAdapterPort.toString()}`,
                    },
                    {
                      // NordVPN은 포트포워딩 미지원 → DoT로 DNS 유출 방지
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
                      // killswitch: 터널 죽으면 외부 트래픽 DROP
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
                  // idle ~27Mi; handshake/updater 스파이크 여유
                  resources: {
                    requests: {
                      cpu: '50m',
                      memory: '64Mi',
                    },
                    limits: {
                      cpu: '200m',
                      memory: '256Mi',
                    },
                  },
                  // :9999 = gluetun VPN health. 실패 시 Pod NotReady → Service에서 제외
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
                  image:
                    'lscr.io/linuxserver/qbittorrent:amd64-5.2.4_v2.0.15-ls480',
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
                      // VueTorrent WebUI 모드
                      name: 'DOCKER_MODS',
                      value: utils.configs.containerImages.vuetorrentMod,
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
                    {
                      // LSIO: /custom-cont-init.d/* 는 서비스 기동 전 실행
                      name: scriptsVolumeName,
                      mountPath: `/custom-cont-init.d/${bindVpnTun0ScriptFileName}`,
                      subPath: bindVpnTun0ScriptFileName,
                    },
                    {
                      name: scriptsVolumeName,
                      mountPath: `/healthcheck/${poststartBindTun0ScriptFileName}`,
                      subPath: poststartBindTun0ScriptFileName,
                    },
                    {
                      name: scriptsVolumeName,
                      mountPath: `/healthcheck/${torrentReadyScriptFileName}`,
                      subPath: torrentReadyScriptFileName,
                    },
                  ],
                  // WebUI 기동 후 API로 tun0 강제 (conf만으로는 eth0 리슨이 남음)
                  lifecycle: {
                    postStart: {
                      exec: {
                        command: [
                          '/bin/sh',
                          `/healthcheck/${poststartBindTun0ScriptFileName}`,
                        ],
                      },
                    },
                  },
                  // 2026-10-21: Disk IO POSIX + OS cache off. 라이브 ~30Mi.
                  // 예전 12Gi/16Gi는 mmap 파일 캐시. VPA ~19Gi는 그 히스토리. 재해시 여유만 둠.
                  resources: {
                    requests: {
                      cpu: '250m',
                      memory: '512Mi',
                    },
                    limits: {
                      cpu: '2',
                      memory: '2Gi',
                    },
                  },
                  // startup/liveness: 프로세스 생존만 (WebUI). DHT 일시 저하로 재시작 금지.
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
                  // readiness: postStart(tun0) + DHT 워밍업 여유
                  readinessProbe: {
                    exec: {
                      command: [
                        '/bin/sh',
                        `/healthcheck/${torrentReadyScriptFileName}`,
                      ],
                    },
                    initialDelaySeconds: 90,
                    periodSeconds: 30,
                    timeoutSeconds: 20,
                    failureThreshold: 10,
                  },
                },

                qbittorrentSftpAdapter.output.spec.containerSpec,
              ],
              volumes: pulumi
                .output(qbittorrentSftpAdapter.output.spec.volumeSpecs)
                .apply(qbittorrentSftpVolumeSpecs => [
                  {
                    // 호스트 /dev/net/tun — WireGuard용
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
                    name: scriptsVolumeName,
                    configMap: {
                      name: qbittorrentScriptsConfigMap.metadata.name,
                      defaultMode: 0o755,
                    },
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
                      claimName:
                        qbittorrentIncompleteDownloadsPvc.metadata.name,
                    },
                  },
                  ...qbittorrentSftpVolumeSpecs,
                ]),
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        // VPN + postStart(tun0) + DHT warmup can exceed default 10m Ready wait
        customTimeouts: {
          create: '20m',
          update: '20m',
        },
        dependsOn: [
          qbittorrentModCachePvc,
          qbittorrentConfigPvc,
          qbittorrentCompleteDownloadsPvc,
          qbittorrentIncompleteDownloadsPvc,
          qbittorrentSftpAdapter,
          qbittorrentScriptsConfigMap,
        ],
      },
    );

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
        pvcs: {
          modCache: {
            name: qbittorrentModCachePvc.metadata.name,
          },
          config: {
            name: qbittorrentConfigPvc.metadata.name,
          },
          completeDownloads: {
            name: qbittorrentCompleteDownloadsPvc.metadata.name,
          },
          incompleteDownloads: {
            name: qbittorrentIncompleteDownloadsPvc.metadata.name,
          },
        },
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
