/**
 * Jellyfin ingress — ambient mesh
 *
 * SSO는 jellyfin-plugin-sso + Authentik OIDC(별도 컴포넌트)라 "proxy outpost 없음".
 * AuthorizationPolicy는 ingress gateway SA에서만 들어오게 막는다 (STRICT mTLS).
 */
import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface JellyfinServiceMeshComponentArgsShape {
  namespace: string;
  authorizationPolicy: {
    from: {
      istioIngress: {
        namespace: string;
        serviceAccountName: string;
      };
    };
  };
  ingress: {
    jellyfinWebUi: {
      host: string;
      serviceName: string;
      gatewayPath: string;
      port: number;
    };
  };
  /**
   * Direct Play 등 대용량 응답이 WAN 업로드를 포화시키지 않도록
   * ingress gateway에서 응답(다운스트림 방향) 대역폭 상한을 건다.
   */
  bandwidthLimit: {
    // 주의: Envoy limit_kbps는 이름과 달리 KiB/s 단위 (1024 KiB/s = 1 MiB/s)
    responseLimitKiBps: number;
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type JellyfinServiceMeshComponentArgs =
  utils.types.DeepPulumiInput<JellyfinServiceMeshComponentArgsShape>;

export const JellyfinServiceMeshComponent = utils.functions.defineComponent(
  'jellyfinServiceMesh',
  (
    args: JellyfinServiceMeshComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const jellyfinVirtualService =
      new customResources.resources.k8s.crd.istio.VirtualServiceV1(
        `${resourceName}-jellyfinVirtualService`,
        {
          metadata: {
            name: 'jellyfin',
            namespace: args.namespace,
          },
          spec: {
            hosts: [args.ingress.jellyfinWebUi.host],
            gateways: [args.ingress.jellyfinWebUi.gatewayPath],
            http: [
              {
                route: [
                  {
                    destination: {
                      host: args.ingress.jellyfinWebUi.serviceName,
                      port: {
                        number: args.ingress.jellyfinWebUi.port,
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
        },
      );

    const defaultPeerAuthentication =
      new customResources.resources.k8s.crd.istio.PeerAuthenticationV1(
        `${resourceName}-defaultPeerAuthentication`,
        {
          metadata: {
            name: 'default',
            namespace: args.namespace,
          },
          spec: {
            mtls: {
              mode: 'STRICT',
            },
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    /**
     * Envoy bandwidth_limit 필터 — jellyfin vhost 응답에만 대역폭 상한 적용.
     *
     * HTTP_FILTER 패치는 gateway 전체 체인에 들어가지만 enable_mode: DISABLED라
     * 다른 서비스에는 영향이 없고, jellyfin vhost의 typed_per_filter_config에서만
     * RESPONSE 방향으로 활성화된다. Direct Play의 무제한 버스트가 집 회선
     * 업로드를 포화시켜 전체 서비스가 질식하는 문제를 페이싱으로 방지한다.
     */
    const jellyfinBandwidthLimitEnvoyFilter =
      new customResources.resources.k8s.crd.istio.EnvoyFilterV1Alpha3(
        `${resourceName}-jellyfinBandwidthLimitEnvoyFilter`,
        {
          metadata: {
            name: 'jellyfin-bandwidth-limit',
            // workloadSelector는 같은 네임스페이스의 워크로드만 선택하므로
            // ingress gateway가 있는 istio 네임스페이스에 생성해야 한다
            namespace: args.authorizationPolicy.from.istioIngress.namespace,
          },
          spec: {
            workloadSelector: {
              labels: {
                istio: 'ingressgateway',
              },
            },
            configPatches: [
              {
                applyTo: 'HTTP_FILTER',
                match: {
                  context: 'GATEWAY',
                  listener: {
                    filterChain: {
                      filter: {
                        name: 'envoy.filters.network.http_connection_manager',
                        subFilter: {
                          name: 'envoy.filters.http.router',
                        },
                      },
                    },
                  },
                },
                patch: {
                  operation: 'INSERT_BEFORE',
                  value: {
                    name: 'envoy.filters.http.bandwidth_limit',
                    typed_config: {
                      '@type':
                        'type.googleapis.com/envoy.extensions.filters.http.bandwidth_limit.v3.BandwidthLimit',
                      'stat_prefix': 'bandwidth_limiter_default',
                      'enable_mode': 'DISABLED',
                    },
                  },
                },
              },
              {
                applyTo: 'HTTP_ROUTE',
                match: {
                  context: 'GATEWAY',
                  routeConfiguration: {
                    vhost: {
                      name: pulumi.interpolate`${args.ingress.jellyfinWebUi.host}:443`,
                      route: {
                        action: 'ANY',
                      },
                    },
                  },
                },
                patch: {
                  operation: 'MERGE',
                  value: {
                    typed_per_filter_config: {
                      'envoy.filters.http.bandwidth_limit': {
                        '@type':
                          'type.googleapis.com/envoy.extensions.filters.http.bandwidth_limit.v3.BandwidthLimit',
                        'stat_prefix': 'bandwidth_limiter_jellyfin',
                        'enable_mode': 'RESPONSE',
                        'limit_kbps': args.bandwidthLimit.responseLimitKiBps,
                        'fill_interval': '0.05s',
                      },
                    },
                  },
                },
              },
            ],
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    const jellyfinAuthorizationPolicy =
      new customResources.resources.k8s.crd.istio.AuthorizationPolicyV1(
        `${resourceName}-jellyfinAuthorizationPolicy`,
        {
          metadata: {
            name: 'jellyfin',
            namespace: args.namespace,
          },
          spec: {
            action: 'ALLOW',
            rules: [
              {
                from: [
                  {
                    // Istio Ingress Gateway에서 들어오는 요청만 허용
                    source: {
                      principals: [
                        pulumi.interpolate`cluster.local/ns/${args.authorizationPolicy.from.istioIngress.namespace}/sa/${args.authorizationPolicy.from.istioIngress.serviceAccountName}`,
                      ],
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
        },
      );

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
