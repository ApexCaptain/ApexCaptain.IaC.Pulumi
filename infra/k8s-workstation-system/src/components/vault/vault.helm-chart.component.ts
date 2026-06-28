/**
 * Vault Helm 배포 + IaC 연동
 *
 * - HashiCorp Vault Helm (Raft, TLS, OCI KMS auto-unseal)
 * - cert-manager 내부 CA·서버 인증서
 * - bootstrap orphan root 토큰 (Pod exec, PVC에 enc 저장)
 * - devContainer → kubectl port-forward → @pulumi/vault Provider
 *
 * Vault namespace는 Istio mesh 밖 (sidecar 미주입).
 */
import path from 'path';
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
import * as time from '@pulumiverse/time';
import dedent from 'dedent';
import _ from 'lodash';

const vaultOciCredentialsSecretName = 'vault-oci-credentials';

interface VaultHelmChartComponentArgsShape {
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
  unsealAuth: {
    userOcid: string;
    tenancyOcid: string;
    fingerprint: string;
    privateKey: string;
    region: string;
  };
  pvc: {
    server: {
      storageClass: string;
      size: string;
    };
  };
  bootstrapToken: {
    kubeconfig: string;
    bootstrapTokenEncryptionKey: string;
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type VaultHelmChartComponentArgs =
  utils.types.DeepPulumiInput<VaultHelmChartComponentArgsShape>;

export const VaultHelmChartComponent = utils.functions.defineComponent(
  'vaultHelmChart',
  async (
    args: VaultHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      {
        metadata: {
          name: 'vault',
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    // Configuration — Helm chart·bootstrap·인증서 SAN과 이름을 맞춘다.
    const vaultServiceName = 'vault';
    /** Helm `app.kubernetes.io/name` label (Pod selector용). Pod 이름(`vault-0`)과 다름 */
    const vaultPodName = 'vault';
    const vaultContainerName = 'vault';
    const vaultHeadlessServiceName = 'vault-internal';
    const vaultServicePort = 8200;
    const vaultClusterPort = 8201;
    const vaultReplicas = 1;
    const vaultMountPath = '/vault/data';
    const vaultRootCaSecretName = 'vault-ca-secret';
    const vaultServerCertificateSecretName = 'vault-server-certificate-secret';

    const toServiceDnsNames = (name: string) => [
      name,
      pulumi.interpolate`${name}.${namespace.metadata.name}`,
      pulumi.interpolate`${name}.${namespace.metadata.name}.svc`,
      pulumi.interpolate`${name}.${namespace.metadata.name}.svc.cluster.local`,
    ];

    const toPodDnsNames = (podName: string) => [
      podName,
      pulumi.interpolate`${podName}.${vaultHeadlessServiceName}`,
      pulumi.interpolate`${podName}.${vaultHeadlessServiceName}.${namespace.metadata.name}`,
      pulumi.interpolate`${podName}.${vaultHeadlessServiceName}.${namespace.metadata.name}.svc`,
      pulumi.interpolate`${podName}.${vaultHeadlessServiceName}.${namespace.metadata.name}.svc.cluster.local`,
    ];

    const vaultServerCertificateDnsNames = [
      ...toServiceDnsNames(vaultServiceName),
      ..._.range(vaultReplicas).flatMap(replicaIndex =>
        toPodDnsNames(`${vaultPodName}-${replicaIndex}`),
      ),
    ];

    // Certs — self-signed root CA → internal issuer → Vault server TLS
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
            dnsNames: vaultServerCertificateDnsNames,
          },
        },
        {
          ...opts,
          dependsOn: [vaultInternalIssuer],
          provider: args.providers.kubernetes,
        },
      );

    // OCI API key — seal "ocikms" auto-unseal용 (VaultKmsComponent에서 발급한 자격 증명)
    const vaultOciCredentialsSecret = new kubernetes.core.v1.Secret(
      `${resourceName}-vaultOciCredentialsSecret`,
      {
        metadata: {
          name: vaultOciCredentialsSecretName,
          namespace: namespace.metadata.name,
        },
        stringData: pulumi
          .all([
            args.unsealAuth.userOcid,
            args.unsealAuth.tenancyOcid,
            args.unsealAuth.fingerprint,
            args.unsealAuth.privateKey,
            args.unsealAuth.region,
          ])
          .apply(
            ([
              resolvedUserOcid,
              resolvedTenancyOcid,
              resolvedFingerprint,
              resolvedPrivateKey,
              resolvedRegion,
            ]) => ({
              'config': dedent`
                [DEFAULT]
                user=${resolvedUserOcid}
                fingerprint=${resolvedFingerprint}
                tenancy=${resolvedTenancyOcid}
                region=${resolvedRegion}
                key_file=/vault/userconfig/${vaultOciCredentialsSecretName}/oci_api_key.pem
              `,
              'oci_api_key.pem': resolvedPrivateKey,
            }),
          ),
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [namespace],
      },
    );

    // Helm Chart — HA Raft, TLS listener, injector 비활성
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
              size: args.pvc.server.size,
              mountPath: vaultMountPath,
              storageClass: args.pvc.server.storageClass,
            },
            dev: {
              enabled: false,
            },
            extraEnvironmentVars: {
              OCI_CONFIG_FILE: `/vault/userconfig/${vaultOciCredentialsSecretName}/config`,
            },
            extraVolumes: [
              {
                type: 'secret',
                name: vaultServerCertificateSecretName,
              },
              {
                type: 'secret',
                name: vaultOciCredentialsSecretName,
              },
            ],

            ha: {
              enabled: true,
              replicas: vaultReplicas,
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
                        disable_mlock = true

                        listener "tcp" {
                          tls_disable = false
                          tls_cert_file = "/vault/userconfig/${vaultServerCertificateSecretName}/tls.crt"
                          tls_key_file  = "/vault/userconfig/${vaultServerCertificateSecretName}/tls.key"
                          address = "[::]:${vaultServicePort}"
                          cluster_address = "[::]:${vaultClusterPort}"
                        }

                        storage "raft" {
                          path = "${vaultMountPath}"
                        }

                        seal "ocikms" {
                          auth_type_api_key = true
                          key_id = "${resolvedKeyId}"
                          crypto_endpoint = "${resolvedCryptoEndpoint}"
                          management_endpoint = "${resolvedManagementEndpoint}"
                        }
                      `;
                    },
                  ),
              },
            },
          },
          injector: {
            enabled: false,
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [
          namespace,
          vaultOciCredentialsSecret,
          vaultServerCertificate,
        ],
      },
    );

    // Bootstrap token — Pod exec로 init·orphan root 토큰 발급/갱신, PVC에 enc 저장
    const bootstrapToken = customResources.data.vault.getBootstrapTokenV1({
      namespace: namespace.metadata.name,
      podName: vaultPodName,
      serviceName: vaultServiceName,
      servicePort: vaultServicePort,
      containerName: vaultContainerName,
      kubeconfig: args.bootstrapToken.kubeconfig,
      tokenDirPath: vaultMountPath,
      bootstrapTokenEncryptionKey:
        args.bootstrapToken.bootstrapTokenEncryptionKey,
      expirationMinutes: 60 * 12,
      vaultServerCertificateSecretName,
    });

    // Port-forward — devContainer에서 Vault API 접근 (매 up마다 health check·재시작)
    const vaultPortForward =
      new customResources.resources.k8s.KubectlPortForwardV1(
        `${resourceName}-vaultPortForward`,
        {
          kubeconfig: args.bootstrapToken.kubeconfig,
          namespace: namespace.metadata.name,
          resourceType: 'svc',
          resourceName: vaultServiceName,
          localPort: parseInt(
            process.env.PULUMI_PORT_FORWARDING_WORKSTATION_VAULT!!,
          ),
          remotePort: vaultServicePort,
          protocol: 'https',
        },
        {
          ...opts,
          dependsOn: [vaultRelease],
        },
      );

    // CA cert — K8s Secret → 로컬 파일. Provider가 127.0.0.1:port로 TLS 검증할 때 사용
    const vaultCaCertFileDirPath = path.join(
      process.env.PULUMI_CONTRACT_CERTS_DIR_PATH!!,
      pulumi.getProject(),
      pulumi.getStack(),
    );
    const vaultCaSecret = kubernetes.core.v1.Secret.get(
      `${resourceName}-vaultCaSecret`,
      pulumi.interpolate`${namespace.metadata.name}/${vaultRootCaSecretName}`,
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [vaultCaCertificate],
      },
    );
    const vaultCaCertFile = new customResources.resources.local.TextFileV1(
      `${resourceName}-vaultCaCertFile`,
      {
        fileName: 'vault-ca.crt',
        fileDirPath: vaultCaCertFileDirPath,
        content: vaultCaSecret.data.apply(data =>
          Buffer.from(data['ca.crt'] ?? '', 'base64').toString('utf8'),
        ),
      },
      {
        ...opts,
        dependsOn: [vaultCaCertificate],
      },
    );

    // TextFileV1 create 직후 Provider가 caCertFile을 읽기 전에 파일이 준비되도록 대기
    const vaultCaCertFilePropagationDelay = new time.Sleep(
      `${resourceName}-vaultCaCertFilePropagationDelay`,
      {
        createDuration: '5s',
      },
      {
        ...opts,
        dependsOn: [vaultCaCertFile],
      },
    );

    // @pulumi/vault Provider — localhost port-forward + SNI는 클러스터 Service DNS

    const portForwardedVaultProviderConfig: vault.ProviderArgs = {
      address: vaultPortForward.localAddress,
      caCertFile: vaultCaCertFile.filePath,
      tlsServerName: pulumi.interpolate`${vaultServiceName}.${namespace.metadata.name}.svc.cluster.local`,
      token: bootstrapToken.token,
    };

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
        services: {
          vault: {
            name: vaultRelease.name,
            ports: {
              vault: vaultServicePort,
            },
          },
        },
        tls: {
          serverName: pulumi.interpolate`${vaultServiceName}.${namespace.metadata.name}.svc.cluster.local`,
          rootCaSecretName: vaultRootCaSecretName,
        },
      }),
      secret: pulumi.secret({
        portForwardedVaultProviderConfig,
        bootstrapToken,
      }),
    };
  },
);
