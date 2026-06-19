import * as customResources from '@common/custom-resources';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import dedent from 'dedent';

interface VaultCoreHelmChartComponentArgsShape {
  helm: {
    vault: {
      version: string;
      repositoryUrl: string;
    };
  };
  kms: {
    oci: {
      keyId: string;
      cryptoEndpoint: string;
      managementEndpoint: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type VaultCoreHelmChartComponentArgs =
  utils.types.DeepPulumiInput<VaultCoreHelmChartComponentArgsShape>;

export const VaultCoreHelmChartComponent = utils.functions.defineComponent(
  'vaultCoreHelmChart',
  (
    args: VaultCoreHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    /*
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'vault',
          labels: {
      'istio.io/dataplane-mode': 'ambient',
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // Configuration
    const vaultServiceName = 'vault';
    const vaultServicePort = 8200;
    const vaultClusterPort = 8201;
    const vaultMountPath = '/vault/data';
    const vaultRootCaSecretName = 'vault-ca-secret';
    const vaultServerCertificateSecretName = 'vault-server-certificate-secret';

    // Certs
    const vaultRootIssuer =
      new customResources.resources.k8s.crd.certManager.IssuerV1(
        `${resourceName}-vaultRootIssuer`,
        {
          metadata: {
            name: 'vault-root-issuer',
            namespace: namespace.metadata.name,
          },
          spec: {
            selfSigned: {},
          },
        },
        {
          ...opts,
          dependsOn: [namespace],
          provider: args.providers.kubernetes,
        },
      );

    const vaultCaCertificate =
      new customResources.resources.k8s.crd.certManager.CertificateV1(
        `${resourceName}-vaultCaCertificate`,
        {
          metadata: {
            name: 'vault-ca-certificate',
            namespace: namespace.metadata.name,
          },
          spec: {
            isCA: true,
            commonName: 'vault-internal-ca',
            secretName: vaultRootCaSecretName,
            issuerRef: {
              name: vaultRootIssuer.metadata.name,
              kind: 'Issuer',
            },
          },
        },
        {
          ...opts,
          dependsOn: [vaultRootIssuer],
          provider: args.providers.kubernetes,
        },
      );

    const vaultInternalIssuer =
      new customResources.resources.k8s.crd.certManager.IssuerV1(
        `${resourceName}-vaultInternalIssuer`,
        {
          metadata: {
            name: 'vault-internal-issuer',
            namespace: namespace.metadata.name,
          },
          spec: {
            ca: {
              secretName: vaultRootCaSecretName,
            },
          },
        },
        {
          ...opts,
          dependsOn: [vaultCaCertificate],
          provider: args.providers.kubernetes,
        },
      );

    const vaultServerCertificate =
      new customResources.resources.k8s.crd.certManager.CertificateV1(
        `${resourceName}-vaultServerCertificate`,
        {
          metadata: {
            name: 'vault-server-certificate',
            namespace: namespace.metadata.name,
          },
          spec: {
            secretName: vaultServerCertificateSecretName,
            issuerRef: {
              name: vaultInternalIssuer.metadata.name,
              kind: 'Issuer',
            },
            dnsNames: [
              vaultServiceName,
              pulumi.interpolate`${vaultServiceName}.${namespace.metadata.name}`,
              pulumi.interpolate`${vaultServiceName}.${namespace.metadata.name}.svc`,
              pulumi.interpolate`${vaultServiceName}.${namespace.metadata.name}.svc.cluster.local`,
            ],
          },
        },
        {
          ...opts,
          dependsOn: [vaultInternalIssuer],
          provider: args.providers.kubernetes,
        },
      );

    const vaultRelease = new kubernetes.helm.v3.Release(
      `${resourceName}-vaultRelease`,
      {
        name: 'vault',
        chart: 'vault',
        version: args.helm.vault.version,
        namespace: namespace.metadata.name,
        repositoryOpts: {
          repo: args.helm.vault.repositoryUrl,
        },
        waitForJobs: true,
        values: {
          global: {
            tlsDisable: false,
          },
          server: {
            dataStorage: {
              enabled: true,
              size: '10Gi',
              mountPath: vaultMountPath,
              storageClass: 'microk8s-hostpath',
            },
            dev: {
              enabled: false,
            },
            ha: {
              enabled: true,
              replicas: 1,
              raft: {
                enabled: true,
                config: pulumi
                  .all([
                    args.kms.oci.keyId,
                    args.kms.oci.cryptoEndpoint,
                    args.kms.oci.managementEndpoint,
                  ])
                  .apply(
                    ([
                      resolvedKeyId,
                      resolvedCryptoEndpoint,
                      resolvedManagementEndpoint,
                    ]) => {
                      return dedent`
                        ui = true
                        listener "tcp" {
                          tls_disable = 0
                          tls_cert_file = "/vault/userconfig/${vaultServerCertificateSecretName}/tls.crt"
                          tls_key_file  = "/vault/userconfig/${vaultServerCertificateSecretName}/tls.key"
                          address = "[::]:${vaultServicePort}"
                          cluster_address = "[::]:${vaultClusterPort}"
                        }

                        storage "raft" {
                          path = "${vaultMountPath}"
                        }

                        seal "ocikms" {
                          key_id = "${resolvedKeyId}"
                          crypto_endpoint = "${resolvedCryptoEndpoint}"
                          management_endpoint = "${resolvedManagementEndpoint}"
                        }

                      `;
                    },
                  ),
              },
            },
            extraVolumes: [
              {
                type: 'secret',
                name: vaultServerCertificateSecretName,
              },
            ],
          },
          injector: {
            enabled: false,
          },
          agent: {
            enabled: false,
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [vaultServerCertificate],
      },
    );
    */

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
