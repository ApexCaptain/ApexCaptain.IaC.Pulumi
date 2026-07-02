/**
 * Vikunja Helm (go-vikunja/bjw-s chart) — 앱 + OIDC 설정.
 *
 * - chart 내장 SQLite/ingress 비활성, 외부 CNPG + Istio VirtualService 사용
 * - config.yml: publicurl, enableregistration, auth.openid (민감값 제외)
 * - client id/secret: vikunja-oidc-secret → VIKUNJA_AUTH_OPENID_PROVIDERS_* env
 * - initContainer: CNPG Ready 전 pg_isready 대기 (dependsOn만으로는 부족)
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';
import Timezone from 'timezone-enum';
import yaml from 'yaml';

interface VikunjaHelmChartComponentArgsShape {
  namespace: string;
  host: string;
  oidc: {
    providerKey: string;
    providerName: string;
    authUrl: string;
    scope: string;
    clientId: string;
    clientSecret: string;
  };
  postgresql: {
    database: string;
    host: string;
    authSecret: {
      name: string;
      usernameKey: string;
      passwordKey: string;
    };
  };
  helm: {
    vikunja: {
      version: string;
      repositoryUrl: string;
    };
  };
  pvc: {
    vikunja: {
      data: {
        storageClass: string;
        size: string;
      };
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type VikunjaHelmChartComponentArgs =
  utils.types.DeepPulumiInput<VikunjaHelmChartComponentArgsShape>;

export const VikunjaHelmChartComponent = utils.functions.defineComponent(
  'vikunjaHelmChart',
  (
    args: VikunjaHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    // VIKUNJA_SERVICE_SECRET — JWT/세션 서명용
    const vikunjaServiceSecretString = new random.RandomString(
      `${resourceName}-vikunjaServiceSecretString`,
      {
        length: 64,
        special: false,
      },
    );
    const vikunjaServiceSecretKey = 'vikunja-service-secret';
    const vikunjaOidcSecretClientIdKey = 'client-id';
    const vikunjaOidcSecretClientSecretKey = 'client-secret';
    const vikunjaServiceSecret = new kubernetes.core.v1.Secret(
      `${resourceName}-vikunjaServiceSecret`,
      {
        metadata: {
          name: 'vikunja-service-secret',
          namespace: args.namespace,
        },
        stringData: {
          [vikunjaServiceSecretKey]: vikunjaServiceSecretString.result,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [vikunjaServiceSecretString],
      },
    );
    // Authentik 컴포넌트 secret → K8s Secret (config.yml에 평문 넣지 않음)
    const vikunjaOidcSecret = new kubernetes.core.v1.Secret(
      `${resourceName}-vikunjaOidcSecret`,
      {
        metadata: {
          name: 'vikunja-oidc-secret',
          namespace: args.namespace,
        },
        stringData: {
          [vikunjaOidcSecretClientIdKey]: args.oidc.clientId,
          [vikunjaOidcSecretClientSecretKey]: args.oidc.clientSecret,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const vikunjaReleaseName = 'vikunja';
    const vikunjaHelmChartRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-vikunjaHelmChartRelease`,
      {
        name: vikunjaReleaseName,
        chart: args.helm.vikunja.repositoryUrl,
        // version: args.helm.vikunja.version,
        namespace: args.namespace,
        waitForJobs: true,
        values: {
          vikunja: {
            persistence: {
              data: {
                enabled: true,
                storageClass: args.pvc.vikunja.data.storageClass,
                size: args.pvc.vikunja.data.size,
              },
              database: {
                enabled: false,
              },
            },
            ingress: {
              main: {
                enabled: false,
              },
            },
            configMaps: {
              config: {
                enabled: true,
                data: {
                  'config.yml': pulumi
                    .all([
                      args.host,
                      args.oidc.providerKey,
                      args.oidc.providerName,
                      args.oidc.authUrl,
                      args.oidc.scope,
                    ])
                    .apply(
                      ([
                        resolvedHost,
                        oidcProviderKey,
                        oidcProviderName,
                        oidcAuthUrl,
                        oidcScope,
                      ]) =>
                        yaml.stringify({
                          service: {
                            publicurl: `https://${resolvedHost}`,
                            enablelinksharing: true,
                            enableregistration: false,
                            timezone: Timezone['Asia/Seoul'],
                          },
                          auth: {
                            local: {
                              enabled: false,
                            },
                            openid: {
                              enabled: true,
                              providers: {
                                [oidcProviderKey]: {
                                  name: oidcProviderName,
                                  authurl: oidcAuthUrl,
                                  scope: oidcScope,
                                },
                              },
                            },
                          },
                        }),
                    ),
                },
              },
            },
            env: pulumi.output(args.oidc.providerKey).apply(oidcProviderKey => ({
              VIKUNJA_DATABASE_TYPE: 'postgres',
              VIKUNJA_DATABASE_HOST: args.postgresql.host,
              VIKUNJA_DATABASE_USER: {
                valueFrom: {
                  secretKeyRef: {
                    name: args.postgresql.authSecret.name,
                    key: args.postgresql.authSecret.usernameKey,
                  },
                },
              },
              VIKUNJA_DATABASE_DATABASE: args.postgresql.database,
              VIKUNJA_DATABASE_PASSWORD: {
                valueFrom: {
                  secretKeyRef: {
                    name: args.postgresql.authSecret.name,
                    key: args.postgresql.authSecret.passwordKey,
                  },
                },
              },
              VIKUNJA_SERVICE_SECRET: {
                valueFrom: {
                  secretKeyRef: {
                    name: vikunjaServiceSecret.metadata.name,
                    key: vikunjaServiceSecretKey,
                  },
                },
              },
              [`VIKUNJA_AUTH_OPENID_PROVIDERS_${oidcProviderKey.toUpperCase()}_CLIENTID`]:
                {
                  valueFrom: {
                    secretKeyRef: {
                      name: vikunjaOidcSecret.metadata.name,
                      key: vikunjaOidcSecretClientIdKey,
                    },
                  },
                },
              [`VIKUNJA_AUTH_OPENID_PROVIDERS_${oidcProviderKey.toUpperCase()}_CLIENTSECRET`]:
                {
                  valueFrom: {
                    secretKeyRef: {
                      name: vikunjaOidcSecret.metadata.name,
                      key: vikunjaOidcSecretClientSecretKey,
                    },
                  },
                },
            })),
            // bjw-s chart: image는 문자열만 (repository/tag 객체 불가)
            initContainers: {
              'wait-for-postgresql': {
                image: 'postgres:18-alpine',
                command: [
                  'sh',
                  '-c',
                  'until pg_isready -h "$PGHOST" -p 5432 -q; do echo "waiting for postgresql"; sleep 2; done',
                ],
                env: {
                  PGHOST: args.postgresql.host,
                },
              },
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [vikunjaServiceSecret, vikunjaOidcSecret],
      },
    );

    const serviceName = vikunjaReleaseName;
    const webServicePort = 3456;

    return {
      output: pulumi.output({
        services: {
          vikunja: {
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
