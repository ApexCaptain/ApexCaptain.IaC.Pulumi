/**
 * Grafana Helm — datasources + Authentik OIDC, Ingress disabled
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface GrafanaHelmChartComponentArgsShape {
  namespace: string;
  host: string;
  adminPassword: string;
  storageClassName: string;
  oidc: {
    name: string;
    issuerUrl: string;
    requestedScopes: string[];
    roleAttributePath: string;
    clientId: string;
    clientSecret: string;
  };
  datasources: {
    victoriaMetrics: {
      url: string;
    };
    loki: {
      url: string;
    };
    tempo: {
      url: string;
    };
  };
  helm: {
    grafana: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type GrafanaHelmChartComponentArgs =
  utils.types.DeepPulumiInput<GrafanaHelmChartComponentArgsShape>;

export const GrafanaHelmChartComponent = utils.functions.defineComponent(
  'grafanaHelmChart',
  (
    args: GrafanaHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const grafanaReleaseName = 'grafana';

    const helmValues = pulumi
      .all([
        args.host,
        args.adminPassword,
        args.storageClassName,
        args.oidc.name,
        args.oidc.issuerUrl,
        args.oidc.clientId,
        args.oidc.clientSecret,
        args.oidc.requestedScopes,
        args.oidc.roleAttributePath,
        args.datasources.victoriaMetrics.url,
        args.datasources.loki.url,
        args.datasources.tempo.url,
      ])
      .apply(
        ([
          host,
          adminPassword,
          storageClassName,
          oidcName,
          issuerUrl,
          clientId,
          clientSecret,
          requestedScopes,
          roleAttributePath,
          victoriaMetricsUrl,
          lokiUrl,
          tempoUrl,
        ]) => {
          const scopes = Array.isArray(requestedScopes)
            ? requestedScopes.join(' ')
            : requestedScopes;

          return {
            'ingress': {
              enabled: false,
            },
            'grafana.ini': {
              'server': {
                root_url: `https://${host}/`,
                domain: host,
              },
              'auth.anonymous': {
                enabled: false,
              },
              'auth.generic_oauth': {
                enabled: true,
                name: oidcName,
                allow_sign_up: true,
                client_id: clientId,
                client_secret: clientSecret,
                scopes,
                auth_url: `${issuerUrl}authorize/`,
                token_url: `${issuerUrl}token/`,
                api_url: `${issuerUrl}userinfo/`,
                role_attribute_path: roleAttributePath,
                role_attribute_strict: true,
              },
            },
            'adminUser': 'admin',
            adminPassword,
            'datasources': {
              'datasources.yaml': {
                apiVersion: 1,
                datasources: [
                  {
                    name: 'VictoriaMetrics',
                    type: 'prometheus',
                    uid: 'VictoriaMetrics',
                    url: victoriaMetricsUrl,
                    access: 'proxy',
                    isDefault: true,
                  },
                  {
                    name: 'Loki',
                    type: 'loki',
                    uid: 'Loki',
                    url: lokiUrl,
                    access: 'proxy',
                  },
                  {
                    name: 'Tempo',
                    type: 'tempo',
                    uid: 'Tempo',
                    url: tempoUrl,
                    access: 'proxy',
                    jsonData: {
                      tracesToLogsV2: {
                        datasourceUid: 'Loki',
                      },
                    },
                  },
                ],
              },
            },
            'persistence': {
              enabled: true,
              storageClassName,
              size: '5Gi',
            },
            'resources': {
              requests: {
                cpu: '100m',
                memory: '256Mi',
              },
              limits: {
                cpu: '500m',
                memory: '512Mi',
              },
            },
          };
        },
      );

    new kubernetes.helm.v3.Release(
      `${resourceName}-release`,
      {
        name: grafanaReleaseName,
        chart: 'grafana',
        version: args.helm.grafana.version,
        namespace: args.namespace,
        repositoryOpts: {
          repo: args.helm.grafana.repositoryUrl,
        },
        waitForJobs: true,
        values: helmValues,
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    return {
      output: pulumi.output({
        services: {
          grafana: {
            name: `${grafanaReleaseName}-grafana`,
            port: {
              http: 80,
            },
          },
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
