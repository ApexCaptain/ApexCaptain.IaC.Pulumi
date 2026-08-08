import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

const SOCKS5_PORT = 1080;
const SOCKS5_SERVICE_NAME = 'coder-workspace-mesh-proxy';
const SOCKS5_APP_LABEL = 'coder-workspace-mesh-proxy';

interface CoderWorkspaceMeshProxyComponentArgsShape {
  namespace: string;
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type CoderWorkspaceMeshProxyComponentArgs =
  utils.types.DeepPulumiInput<CoderWorkspaceMeshProxyComponentArgsShape>;

/**
 * Mesh 밖의 Sysbox 워크스페이스가 내부 mesh 서비스에 선택적으로 접근할 때
 * 사용하는 namespace 공용 SOCKS5 게이트웨이.
 *
 * 이 Pod 자체는 ambient mesh에 참여하므로 목적지 mesh 서비스까지의 구간은
 * 이 ServiceAccount identity로 mTLS 처리된다.
 */
export const CoderWorkspaceMeshProxyComponent =
  utils.functions.defineComponent(
    'coder-workspace-mesh-proxy',
    (
      args: CoderWorkspaceMeshProxyComponentArgs,
      opts: pulumi.ComponentResourceOptions,
      resourceName: string,
    ) => {
      const labels = {
        'app.kubernetes.io/name': SOCKS5_APP_LABEL,
        'app.kubernetes.io/part-of': 'coder',
        'app.kubernetes.io/component': 'mesh-proxy',
      };

      const serviceAccount = new kubernetes.core.v1.ServiceAccount(
        `${resourceName}-serviceAccount`,
        {
          metadata: {
            name: SOCKS5_SERVICE_NAME,
            namespace: args.namespace,
            labels,
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

      const deployment = new kubernetes.apps.v1.Deployment(
        `${resourceName}-deployment`,
        {
          metadata: {
            name: SOCKS5_SERVICE_NAME,
            namespace: args.namespace,
            labels,
          },
          spec: {
            replicas: 1,
            selector: {
              matchLabels: labels,
            },
            template: {
              metadata: {
                labels,
              },
              spec: {
                serviceAccountName: serviceAccount.metadata.name,
                enableServiceLinks: false,
                containers: [
                  {
                    name: 'socks5',
                    image: 'serjs/go-socks5-proxy:latest',
                    imagePullPolicy: 'Always',
                    env: [
                      {
                        name: 'PROXY_PORT',
                        value: SOCKS5_PORT.toString(),
                      },
                      {
                        name: 'REQUIRE_AUTH',
                        value: 'false',
                      },
                    ],
                    ports: [
                      {
                        name: 'socks5',
                        containerPort: SOCKS5_PORT,
                        protocol: 'TCP',
                      },
                    ],
                    // distroless 단일 바이너리: 프로세스 종료 = 컨테이너 종료.
                    // tcpSocket probe는 SOCKS 핸드셰이크 없이 연결만 열어
                    // "Failed to get version byte: EOF" 노이즈를 만든다.
                    resources: {
                      requests: {
                        cpu: '10m',
                        memory: '16Mi',
                      },
                      limits: {
                        cpu: '250m',
                        memory: '64Mi',
                      },
                    },
                    securityContext: {
                      allowPrivilegeEscalation: false,
                      capabilities: {
                        drop: ['ALL'],
                      },
                      readOnlyRootFilesystem: true,
                      runAsNonRoot: true,
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
          dependsOn: [serviceAccount],
        },
      );

      const service = new kubernetes.core.v1.Service(
        `${resourceName}-service`,
        {
          metadata: {
            name: SOCKS5_SERVICE_NAME,
            namespace: args.namespace,
            labels,
          },
          spec: {
            type: 'ClusterIP',
            selector: labels,
            ports: [
              {
                name: 'socks5',
                port: SOCKS5_PORT,
                targetPort: 'socks5',
                protocol: 'TCP',
              },
            ],
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
          dependsOn: [deployment],
        },
      );

      // 인증 없는 공용 proxy이므로 동일 namespace workload만 접속을 허용한다.
      new kubernetes.networking.v1.NetworkPolicy(
        `${resourceName}-networkPolicy`,
        {
          metadata: {
            name: SOCKS5_SERVICE_NAME,
            namespace: args.namespace,
            labels,
          },
          spec: {
            podSelector: {
              matchLabels: labels,
            },
            policyTypes: ['Ingress'],
            ingress: [
              {
                from: [
                  {
                    namespaceSelector: {
                      matchLabels: {
                        'kubernetes.io/metadata.name': args.namespace,
                      },
                    },
                  },
                ],
                ports: [
                  {
                    port: SOCKS5_PORT,
                    protocol: 'TCP',
                  },
                ],
              },
            ],
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
          dependsOn: [deployment],
        },
      );

      const host = pulumi.interpolate`${service.metadata.name}.${args.namespace}.svc.cluster.local`;

      return {
        output: pulumi.output({
          host,
          port: SOCKS5_PORT,
          url: pulumi.interpolate`socks5h://${host}:${SOCKS5_PORT}`,
          serviceAccountName: serviceAccount.metadata.name,
        }),
        secret: pulumi.secret({}),
      };
    },
  );
