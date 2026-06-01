import * as nexus from '@common/nexus/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface CertManagerResourcesComponentArgsShape {
  namespace: string;
  cloudflareApiToken: string;
  cloudflareEmail: string;
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type CertManagerResourcesComponentArgs =
  utils.types.DeepPulumiInput<CertManagerResourcesComponentArgsShape>;

export const CertManagerResourcesComponent = nexus.function.defineComponent(
  'certManagerResources',
  (
    args: CertManagerResourcesComponentArgs,
    opts: pulumi.ComponentResourceOptions,
  ) => {
    const cloudflareApiTokenKey = 'api-token';

    const cloudflareApiTokenSecret = new kubernetes.core.v1.Secret(
      'cloudflareApiTokenSecret',
      {
        metadata: {
          name: 'cloudflare-api-token',
          namespace: args.namespace,
        },
        data: {
          [cloudflareApiTokenKey]: pulumi
            .output(args.cloudflareApiToken)
            .apply(tokenValue => Buffer.from(tokenValue).toString('base64')),
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const letsEncryptProdClusterIssuerName = 'lets-encrypt-prod';
    const letsEncryptProdClusterIssuer =
      new nexus.crd.certManager.ClusterIssuerV1Crd(
        'letsEncryptProdClusterIssuer',
        {
          metadata: {
            name: 'lets-encrypt-prod',
          },
          spec: {
            acme: {
              server: 'https://acme-v02.api.letsencrypt.org/directory',
              email: args.cloudflareEmail,
              privateKeySecretRef: {
                name: 'letsencrypt-prod',
              },
              solvers: [
                {
                  dns01: {
                    cloudflare: {
                      email: args.cloudflareEmail,
                      apiTokenSecretRef: {
                        name: cloudflareApiTokenSecret.metadata.name,
                        key: cloudflareApiTokenKey,
                      },
                    },
                  },
                },
              ],
            },
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );

    const letsEncryptStagingClusterIssuerName = 'lets-encrypt-staging';
    const letsEncryptStagingClusterIssuer =
      new nexus.crd.certManager.ClusterIssuerV1Crd(
        'letsEncryptStagingClusterIssuer',
        {
          metadata: {
            name: 'lets-encrypt-staging',
          },
          spec: {
            acme: {
              server: 'https://acme-staging-v02.api.letsencrypt.org/directory',
              email: args.cloudflareEmail,
              privateKeySecretRef: {
                name: 'letsencrypt-staging',
              },
              solvers: [
                {
                  dns01: {
                    cloudflare: {
                      email: args.cloudflareEmail,
                      apiTokenSecretRef: {
                        name: cloudflareApiTokenSecret.metadata.name,
                        key: cloudflareApiTokenKey,
                      },
                    },
                  },
                },
              ],
            },
          },
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
        },
      );
    return {
      output: pulumi.output({
        letsEncryptProdClusterIssuerName,
        letsEncryptStagingClusterIssuerName,
      }),
      secret: pulumi.secret({}),
    };
  },
);
