import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface CoderHelmChartComponentArgsShape {
  namespace: string;
  host: string;
  adminUser: {
    email: string;
    username: string;
    fullName: string;
    password: string;
  };
  oidc: {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
  };
  postgresql: {
    urlSecret: {
      name: string;
      key: string;
    };
  };
  helm: {
    coder: {
      version: string;
      repositoryUrl: string;
    };
  };
  adminApiToken: {
    kubeconfig: string;
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type CoderHelmChartComponentArgs =
  utils.types.DeepPulumiInput<CoderHelmChartComponentArgsShape>;

export const CoderHelmChartComponent = utils.functions.defineComponent(
  'coderHelmChart',
  (
    args: CoderHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const coderFirstUserSecretEmailKey = 'email';
    const coderFirstUserSecretUsernameKey = 'username';
    const coderFirstUserSecretFullNameKey = 'full-name';
    const coderFirstUserSecretPasswordKey = 'password';
    const coderFirstUserSecret = new kubernetes.core.v1.Secret(
      `${resourceName}-coderFirstUserSecret`,
      {
        metadata: {
          name: 'coder-first-user-secret',
          namespace: args.namespace,
        },
        stringData: {
          [coderFirstUserSecretEmailKey]: args.adminUser.email,
          [coderFirstUserSecretUsernameKey]: args.adminUser.username,
          [coderFirstUserSecretFullNameKey]: args.adminUser.fullName,
          [coderFirstUserSecretPasswordKey]: args.adminUser.password,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const coderOidcSecretClientIdKey = 'client-id';
    const coderOidcSecretClientSecretKey = 'client-secret';
    const coderOidcSecret = new kubernetes.core.v1.Secret(
      `${resourceName}-coderOidcSecret`,
      {
        metadata: {
          name: 'coder-oidc-secret',
          namespace: args.namespace,
        },
        stringData: {
          [coderOidcSecretClientIdKey]: args.oidc.clientId,
          [coderOidcSecretClientSecretKey]: args.oidc.clientSecret,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const coderReleaseName = 'coder';
    const coderContainerName = 'coder';
    const coderHelmChartRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-coderHelmChartRelease`,
      {
        name: coderReleaseName,
        chart: 'coder',
        version: args.helm.coder.version,
        namespace: args.namespace,
        repositoryOpts: {
          repo: args.helm.coder.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          coder: {
            env: [
              {
                name: 'CODER_ACCESS_URL',
                value: pulumi.interpolate`https://${args.host}`,
              },
              {
                name: 'CODER_PG_CONNECTION_URL',
                valueFrom: {
                  secretKeyRef: {
                    name: args.postgresql.urlSecret.name,
                    key: args.postgresql.urlSecret.key,
                  },
                },
              },
              {
                name: 'CODER_OIDC_ISSUER_URL',
                value: args.oidc.issuerUrl,
              },
              {
                name: 'CODER_OIDC_CLIENT_ID',
                valueFrom: {
                  secretKeyRef: {
                    name: coderOidcSecret.metadata.name,
                    key: coderOidcSecretClientIdKey,
                  },
                },
              },
              {
                name: 'CODER_OIDC_CLIENT_SECRET',
                valueFrom: {
                  secretKeyRef: {
                    name: coderOidcSecret.metadata.name,
                    key: coderOidcSecretClientSecretKey,
                  },
                },
              },
              {
                name: 'CODER_OIDC_SCOPES',
                value: 'openid,profile,email,offline_access',
              },
              {
                // Authentik은 email_verified claim을 false/미설정으로 주는 경우가 많음.
                // toolsUserGroup으로 앱 접근을 이미 제한하므로 Coder 측 검증은 생략.
                name: 'CODER_OIDC_IGNORE_EMAIL_VERIFIED',
                value: 'true',
              },
              {
                name: 'CODER_OAUTH2_GITHUB_DEFAULT_PROVIDER_ENABLE',
                value: 'false',
              },
              {
                name: 'CODER_OIDC_SIGN_IN_TEXT',
                value: 'Sign in with Authentik',
              },
              {
                name: 'CODER_OIDC_ICON_URL',
                value:
                  'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/authentik.svg',
              },
              {
                // Coder docs는 owner password 예외를 말하지만, 현재 버전(2.35.3) 구현은
                // DisablePasswordAuth=true면 owner 포함 전원 login 403이다.
                // admin password + API token bootstrap을 위해 false. 업스트림 수정 후 재검토.
                name: 'CODER_DISABLE_PASSWORD_AUTH',
                value: 'false',
              },
            ],
            service: {
              type: 'ClusterIP',
            },
            ingress: {
              enable: false,
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [coderOidcSecret, coderFirstUserSecret],
      },
    );

    // Admin API token — kubectl exec 스크립트 (stack secret 미노출, log만)
    const tokenLifetimeHours = 168;
    const adminApiToken = new customResources.resources.coder.AdminApiTokenV1(
      `${resourceName}-adminApiToken`,
      {
        namespace: args.namespace,
        podAppName: coderReleaseName,
        containerName: coderContainerName,
        coderLocalUrl: 'http://127.0.0.1:8080',
        kubeconfig: args.adminApiToken.kubeconfig,
        adminUser: {
          email: args.adminUser.email,
          username: args.adminUser.username,
          fullName: args.adminUser.fullName,
          password: args.adminUser.password,
        },
        tokenName: 'pulumi-admin',
        tokenLifetimeHours,
        expirationMinutes: tokenLifetimeHours * 60,
      },
      {
        ...opts,
        dependsOn: [coderHelmChartRelease],
      },
    );

    return {
      output: pulumi.output({
        release: {
          name: coderHelmChartRelease.name,
        },
        services: {
          coder: {
            name: coderReleaseName,
            port: {
              http: 80,
            },
          },
        },
      }),
      secret: pulumi.secret({
        adminApiToken: {
          token: adminApiToken.token,
          tokenId: adminApiToken.tokenId,
          organizationId: adminApiToken.organizationId,
        },
      }),
    };
  },
);
