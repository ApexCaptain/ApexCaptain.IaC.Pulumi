/**
 * cloudflared connector — Cloudflare Tunnel을 클러스터 안에서 연다.
 *
 * - 무상태. 같은 터널 토큰으로 replica를 늘리면 connector가 이중화된다.
 * - namespace는 mesh 밖 (ambient 라벨 없음): Cloudflare edge로 나가는 QUIC(7844)와
 *   LAN 대상 직통이 필요하고 mesh 이점이 없다.
 * - inbound Service 없음. 모든 연결은 outbound.
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface ZeroTrustConnectorComponentArgsShape {
  tunnelToken: string;
  image: string;
  replicas: number;
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type ZeroTrustConnectorComponentArgs =
  utils.types.DeepPulumiInput<ZeroTrustConnectorComponentArgsShape>;

export const ZeroTrustConnectorComponent = utils.functions.defineComponent(
  'zeroTrustConnector',
  (
    args: ZeroTrustConnectorComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const k8sOpts = { ...opts, provider: args.providers.kubernetes };

    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'zero-trust',
          labels: {
            'goldilocks.fairwinds.com/enabled': 'true',
          },
        },
      },
      k8sOpts,
    );

    const tunnelTokenSecretKey = 'token';
    const tunnelTokenSecret = new kubernetes.core.v1.Secret(
      `${resourceName}-tunnelTokenSecret`,
      {
        metadata: {
          name: 'cloudflared-tunnel-token',
          namespace: namespace.metadata.name,
        },
        stringData: {
          [tunnelTokenSecretKey]: args.tunnelToken,
        },
      },
      k8sOpts,
    );

    const cloudflaredLabels = { app: 'cloudflared' };
    const metricsPort = 2000;

    new kubernetes.apps.v1.Deployment(
      `${resourceName}-cloudflaredDeployment`,
      {
        metadata: {
          name: 'cloudflared',
          namespace: namespace.metadata.name,
          annotations: {
            'secret.reloader.stakater.com/reload':
              tunnelTokenSecret.metadata.name,
          },
        },
        spec: {
          replicas: args.replicas,
          selector: {
            matchLabels: cloudflaredLabels,
          },
          template: {
            metadata: {
              labels: cloudflaredLabels,
            },
            spec: {
              securityContext: {
                runAsNonRoot: true,
                // cloudflared 이미지 기본 nonroot 사용자
                runAsUser: 65532,
                // ICMP proxy(ping)용 — 없으면 cloudflared가 경고만 남기고 동작한다
                sysctls: [
                  {
                    name: 'net.ipv4.ping_group_range',
                    value: '65532 65532',
                  },
                ],
              },
              containers: [
                {
                  name: 'cloudflared',
                  image: args.image,
                  args: [
                    'tunnel',
                    '--no-autoupdate',
                    '--metrics',
                    `0.0.0.0:${metricsPort}`,
                    'run',
                  ],
                  env: [
                    {
                      name: 'TUNNEL_TOKEN',
                      valueFrom: {
                        secretKeyRef: {
                          name: tunnelTokenSecret.metadata.name,
                          key: tunnelTokenSecretKey,
                        },
                      },
                    },
                  ],
                  ports: [
                    {
                      name: 'metrics',
                      containerPort: metricsPort,
                    },
                  ],
                  readinessProbe: {
                    httpGet: {
                      path: '/ready',
                      port: metricsPort,
                    },
                    periodSeconds: 10,
                  },
                  livenessProbe: {
                    httpGet: {
                      path: '/ready',
                      port: metricsPort,
                    },
                    initialDelaySeconds: 10,
                    periodSeconds: 10,
                    failureThreshold: 3,
                  },
                  // 시작값. Goldilocks/VPA 결과로 조정
                  resources: {
                    requests: {
                      cpu: '10m',
                      memory: '32Mi',
                    },
                    limits: {
                      cpu: '200m',
                      memory: '128Mi',
                    },
                  },
                  securityContext: {
                    allowPrivilegeEscalation: false,
                    readOnlyRootFilesystem: true,
                    capabilities: {
                      drop: ['ALL'],
                    },
                  },
                },
              ],
            },
          },
        },
      },
      k8sOpts,
    );

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
      }),
      secret: pulumi.secret({}),
    };
  },
);
