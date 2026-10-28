import * as nexus from '@common/nexus';
import * as utils from '@common/utils/src';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
import CronTime from 'cron-time-generator';
import Timezone from 'timezone-enum';
import * as components from '../components';
import { AuthentikPhase } from './authentik';
import { BackupPlatformPhase } from './backup-platform';
import { CertManagerPhase } from './cert-manager';
import { MeshPhase } from './mesh';
import { SystemProviders } from './providers';

/** Vault 서버 — mesh 밖 Helm, OCI KMS auto-unseal. TLS는 cert-manager CA. */
export const deployVaultServer = (deps: {
  providers: SystemProviders;
  certManager: CertManagerPhase;
}) => {
  const commonEsc = nexus.esc.commonEsc;
  const projectEsc = nexus.esc.k8sWorkstationSystemEsc;
  const { workstationK8sProvider, ociProvider } = deps.providers;
  const { certManagerHelmChart } = deps.certManager;

  // Vault — mesh 밖 Helm, IaC Provider는 ingress mesh 경유 (OIDC는 후속)
  const vaultKms = new components.vault.VaultKmsComponent('vaultKms', {
    tenancyOcid: nexus.esc.ociEsc.esc.tenancyOcid,
    region: nexus.esc.ociEsc.esc.region,
    providers: {
      oci: ociProvider,
    },
  });

  const vaultHelmChart = new components.vault.VaultHelmChartComponent(
    'vaultHelmChart',
    {
      helm: {
        vault: {
          version: utils.configs.helmChartVersions.vault,
          repositoryUrl:
            commonEsc.esc.helmRepositoryUrls['helm.releases.hashicorp.com'],
        },
      },
      kms: {
        oci: {
          keyId: vaultKms.secret.apply(secret => secret.kms.keyId),
          cryptoEndpoint: vaultKms.secret.apply(
            secret => secret.kms.cryptoEndpoint,
          ),
          managementEndpoint: vaultKms.secret.apply(
            secret => secret.kms.managementEndpoint,
          ),
        },
      },
      unsealAuth: vaultKms.secret.apply(secret => secret.unsealAuth),
      pvc: {
        server: {
          storageClass: commonEsc.esc.workstationLocalPathStorageClassName,
          size: '10Gi',
        },
      },
      bootstrapToken: {
        kubeconfig: commonEsc.esc.workstationKubeconfig,
        bootstrapTokenEncryptionKey:
          projectEsc.esc.vault.bootstrapTokenEncryptionKey,
      },
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
    { dependsOn: [vaultKms, certManagerHelmChart] },
  );

  // 클러스터 내부 Vault 주소 (backup Job·VSO·contract secret 공용)
  const clusterAddress = pulumi.interpolate`https://${vaultHelmChart.output.tls.serverName}:${vaultHelmChart.output.services.vault.ports.vault}`;

  return { vaultKms, vaultHelmChart, clusterAddress };
};

export type VaultServerPhase = ReturnType<typeof deployVaultServer>;

/**
 * Vault 접근 경로 — 공개 ingress + TLS origination, IaC Provider, KV·SSH·k8s auth, raft 백업.
 * Authentik OIDC 이전 단계라 bootstrap token으로 Provider를 만든다.
 */
export const deployVaultAccess = (deps: {
  providers: SystemProviders;
  vaultServer: VaultServerPhase;
  mesh: MeshPhase;
  backupPlatform: BackupPlatformPhase;
}) => {
  const commonEsc = nexus.esc.commonEsc;
  const { workstationK8sProvider } = deps.providers;
  const { vaultHelmChart, clusterAddress } = deps.vaultServer;
  const { istioHelmChart, istioGateway } = deps.mesh;
  const { pcloudBackupPlatform } = deps.backupPlatform;

  // Vault Service Mesh — 공개 ingress + TLS origination (Authentik OIDC 전 단계)
  const vaultServiceMesh = new components.vault.VaultServiceMeshComponent(
    'vaultServiceMesh',
    {
      namespace: vaultHelmChart.output.namespace,
      ingress: {
        istioNamespace: istioHelmChart.output.namespace,
        vault: {
          host: cloudflareContract.output.zones.ayteneve93com.records.vault,
          serviceHost: vaultHelmChart.output.tls.serverName,
          tlsServerName: vaultHelmChart.output.tls.serverName,
          gatewayPath: istioGateway.output.istioIngressGatewayPath,
          gatewayLabel: istioHelmChart.output.istioIngressGatewayLabel,
          port: vaultHelmChart.output.services.vault.ports.vault,
        },
      },
      vault: {
        bootstrapToken: vaultHelmChart.secret.apply(
          secret => secret.bootstrapToken.token,
        ),
        rootCaSecretName: vaultHelmChart.output.tls.rootCaSecretName,
        serverVersion: utils.configs.vaultVersion,
      },
      providers: {
        kubernetes: workstationK8sProvider,
      },
    },
    {
      dependsOn: [istioGateway, vaultHelmChart, istioHelmChart],
    },
  );

  const vaultProvider = new vault.Provider(
    'vaultProvider',
    vaultServiceMesh.secret.apply(secret => secret.vaultProviderConfig),
    {
      dependsOn: [vaultServiceMesh],
    },
  );

  const vaultResources = new components.vault.VaultResourcesComponent(
    'vaultResources',
    {
      providers: {
        vault: vaultProvider,
      },
    },
    {
      dependsOn: [vaultHelmChart, vaultServiceMesh, vaultProvider],
    },
  );

  const vaultKubernetesAuth =
    new components.vault.VaultKubernetesAuthComponent(
      'vaultKubernetesAuth',
      {
        kubeconfig: commonEsc.esc.workstationKubeconfig,
        providers: {
          kubernetes: workstationK8sProvider,
          vault: vaultProvider,
        },
      },
      {
        dependsOn: [vaultResources, vaultProvider],
      },
    );

  // Vault raft → pCloud Crypt (Lane A). PVC snap 아님.
  const vaultBackup = new components.vault.VaultBackupComponent(
    'vaultBackup',
    {
      namespace: vaultHelmChart.output.namespace,
      leafName: 'data-vault-0',
      runOnceOnCreate: false,
      schedule: {
        cron: CronTime.everyDayAt(12),
        timezone: Timezone['Asia/Seoul'],
      },
      keepWithin: '10d',
      platform: {
        namespace: pcloudBackupPlatform.output.namespace,
        configMapName: pcloudBackupPlatform.output.configMapName,
        credentialsSecretName:
          pcloudBackupPlatform.output.credentialsSecretName,
        slackSecretName: pcloudBackupPlatform.output.slackSecretName,
        drLeaseName: pcloudBackupPlatform.output.drLeaseName,
      },
      vault: {
        address: clusterAddress,
        caSecretName: vaultHelmChart.output.tls.rootCaSecretName,
        kubernetesAuthMountPath: vaultKubernetesAuth.output.mountPath,
      },
      providers: {
        kubernetes: workstationK8sProvider,
        vault: vaultProvider,
      },
    },
    {
      dependsOn: [pcloudBackupPlatform, vaultHelmChart, vaultKubernetesAuth],
    },
  );

  return {
    vaultServiceMesh,
    vaultProvider,
    vaultResources,
    vaultKubernetesAuth,
    vaultBackup,
  };
};

export type VaultAccessPhase = ReturnType<typeof deployVaultAccess>;

/** Vault ↔ Authentik — OIDC 로그인, Coder JWT, identity tier 그룹. Authentik 리소스 이후. */
export const deployVaultIdentity = (deps: {
  vaultServer: VaultServerPhase;
  vaultAccess: VaultAccessPhase;
  authentik: AuthentikPhase;
}) => {
  const { vaultHelmChart } = deps.vaultServer;
  const { vaultServiceMesh, vaultProvider, vaultResources } = deps.vaultAccess;
  const { authentikResources, authentikProvider } = deps.authentik;

  const vaultAuthentik = new components.vault.VaultAuthentikComponent(
    'vaultAuthentik',
    {
      hosts: {
        vault: cloudflareContract.output.zones.ayteneve93com.records.vault,
        authentik: cloudflareContract.output.zones.ayteneve93com.records.auth,
      },
      authentik: {
        allowedGroupId: authentikResources.output.groupIds.systemManagerGroup,
        flow: {
          authorizationFlowId:
            authentikResources.output.flow
              .defaultProviderAuthorizationImplicitConsentId,
          invalidationFlowId:
            authentikResources.output.flow.defaultInvalidationFlowId,
        },
      },
      providers: {
        vault: vaultProvider,
        authentik: authentikProvider,
      },
      vault: {
        oidcKvPolicyName: vaultResources.output.oidcKvPolicyName,
      },
    },
    {
      dependsOn: [
        vaultHelmChart,
        vaultServiceMesh,
        authentikResources,
        authentikProvider,
        vaultResources,
      ],
    },
  );

  const vaultCoderJwt = new components.vault.VaultCoderJwtComponent(
    'vaultCoderJwt',
    {
      hosts: {
        authentik: cloudflareContract.output.zones.ayteneve93com.records.auth,
      },
      allowedGroupNames: ['System User', 'System Manager'],
      providers: {
        vault: vaultProvider,
      },
    },
    {
      dependsOn: [vaultAuthentik, vaultResources],
    },
  );

  const vaultIdentityTiers = new components.vault.VaultIdentityTiersComponent(
    'vaultIdentityTiers',
    {
      oidcMountAccessor: vaultAuthentik.output.oidc.mountAccessor,
      coderJwtMountAccessor: vaultCoderJwt.output.jwt.mountAccessor,
      oidcKvPolicyName: vaultResources.output.oidcKvPolicyName,
      providers: {
        vault: vaultProvider,
      },
    },
    {
      dependsOn: [vaultAuthentik, vaultCoderJwt, vaultResources],
    },
  );

  return { vaultAuthentik, vaultCoderJwt, vaultIdentityTiers };
};

/** Vault Secrets Operator — 앱 스택이 VaultStaticSecret 등으로 쓰는 VaultConnection. */
export const deployVaultSecretsOperator = (deps: {
  providers: SystemProviders;
  vaultServer: VaultServerPhase;
}) => {
  const commonEsc = nexus.esc.commonEsc;
  const { workstationK8sProvider } = deps.providers;
  const { vaultHelmChart, clusterAddress } = deps.vaultServer;

  const vaultSecretsOperatorHelmChart =
    new components.vaultSecretsOperator.VaultSecretsOperatorHelmChartComponent(
      'vaultSecretsOperatorHelmChart',
      {
        helm: {
          vaultSecretOperator: {
            version: utils.configs.helmChartVersions.vaultSecretOperator,
            repositoryUrl:
              commonEsc.esc.helmRepositoryUrls['helm.releases.hashicorp.com'],
          },
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      {
        dependsOn: [vaultHelmChart],
      },
    );

  const vaultSecretsOperatorResources =
    new components.vaultSecretsOperator.VaultSecretsOperatorResourcesComponent(
      'vaultSecretsOperatorResources',
      {
        namespace: vaultSecretsOperatorHelmChart.output.namespace,
        vault: {
          namespace: vaultHelmChart.output.namespace,
          rootCaSecretName: vaultHelmChart.output.tls.rootCaSecretName,
          address: clusterAddress,
          tlsServerName: vaultHelmChart.output.tls.serverName,
        },
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      {
        dependsOn: [vaultSecretsOperatorHelmChart, vaultHelmChart],
      },
    );

  return { vaultSecretsOperatorHelmChart, vaultSecretsOperatorResources };
};
