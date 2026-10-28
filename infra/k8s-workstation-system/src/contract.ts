/**
 * Workstation 클러스터의 "시스템" 스택.
 *
 * 각 단계는 `./phases`의 조립 함수다. 아래 호출 순서가 배포 순서이고,
 * 단계 간 의존은 인자로 넘긴 이전 단계 결과(+ 각 컴포넌트의 `dependsOn`)로 드러난다.
 * apps/tools 스택이 여기 output을 참조한다.
 *
 * 배포 순서가 꼬이기 쉬운 구간:
 * - Vault는 cert-manager CA에, mesh ingress는 LE wildcard cert에 의존
 * - Authentik PG는 Longhorn SSD SC에, Longhorn UI는 Authentik proxy에 의존
 *   → Longhorn↔Authentik 3단계 분리는 아래 JSDoc 참고
 *
 * 리소스 이름·parent를 바꾸면 URN이 바뀐다. 단계 이동은 preview diff 0으로 확인한다.
 * output 객체 키 순서는 contract hash에 들어가므로 바꾸지 않는다.
 */
import * as nexus from '@common/nexus';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import * as pulumi from '@pulumi/pulumi';
import * as phases from './phases';

export const k8sWorkstationSystemContract = new nexus.classes.Contract(
  __filename,
  async () => {
    const providers = phases.deployProviders();

    const {
      sysbox,
      lxcfsHelmChart,
      genericDevicePluginHelmChart,
      gpuRuntimeClass,
      gpuOperatorHelmChart,
    } = phases.deployNodeRuntime({ providers });

    const certManager = phases.deployCertManager({ providers });
    const backupPlatform = phases.deployBackupPlatform({ providers });
    const { pcloudBackupPlatform } = backupPlatform;

    // Vault 서버는 mesh보다 먼저, 접근 경로(ingress·Provider)는 mesh 이후
    const vaultServer = phases.deployVaultServer({ providers, certManager });
    const { vaultHelmChart } = vaultServer;

    const mesh = phases.deployMesh({ providers, certManager });
    const { istioHelmChart, istioGateway } = mesh;

    const dataOperators = phases.deployDataOperators({ providers });

    const vaultAccess = phases.deployVaultAccess({
      providers,
      vaultServer,
      mesh,
      backupPlatform,
    });
    const { vaultServiceMesh, vaultResources, vaultKubernetesAuth, vaultBackup } =
      vaultAccess;

    /**
     * Longhorn ↔ Authentik 상호 의존으로 배포 순서·리소스 구성이 3단계로 나뉜다.
     *
     * - Authentik PostgreSQL PVC는 Longhorn storage class에 의존한다.
     * - Longhorn UI는 Authentik proxy outpost(Istio ext-authz)로 보호된다.
     * - Authentik Outpost 생성 API는 protocolProviders가 비어 있으면 거부한다.
     *
     * 따라서 한 component에 묶으면 Outpost ↔ ProviderProxy 순환 의존이 생긴다.
     * 아래 순서로 분리한다.
     *
     * 1. deployAuthentik — groups/flows/oauth/serviceConnection (Outpost 없음)
     * 2. deployLonghornServiceMesh — ProviderProxy 등 앱별 Authentik·mesh 리소스
     * 3. deployAuthentikOutpost — longhorn provider를 bootstrap으로 Outpost 생성
     *
     * longhorn 이후 추가되는 proxy outpost 앱(tools/apps 등)은
     * OutpostProviderAttachment로 연결한다. Outpost.protocolProviders는
     * bootstrap만 담당하며, attachment로 붙은 provider drift는
     * AuthentikOutpostComponent의 ignoreChanges로 무시한다.
     */
    const longhorn = phases.deployLonghorn({ providers });
    const { longhornResources } = longhorn;

    const authentik = phases.deployAuthentik({
      providers,
      longhorn,
      dataOperators,
      mesh,
    });
    const { authentikHelmChart, authentikResources } = authentik;

    const { vaultAuthentik, vaultCoderJwt, vaultIdentityTiers } =
      phases.deployVaultIdentity({ vaultServer, vaultAccess, authentik });

    const longhornServiceMesh = phases.deployLonghornServiceMesh({
      providers,
      longhorn,
      mesh,
      authentik,
    });

    const authentikOutpostPhase = phases.deployAuthentikOutpost({
      authentik,
      longhornServiceMesh,
    });
    const { authentikOutpost } = authentikOutpostPhase;

    // Authentik proxy outpost 뒤에 붙는 시스템 UI·나머지 애드온
    phases.deployAutoscaling({
      providers,
      mesh,
      authentik,
      authentikOutpost: authentikOutpostPhase,
    });

    const { vaultSecretsOperatorHelmChart, vaultSecretsOperatorResources } =
      phases.deployVaultSecretsOperator({ providers, vaultServer });

    phases.deployReloader({ providers });

    phases.deployArgo({
      providers,
      mesh,
      longhorn,
      dataOperators,
      authentik,
    });

    phases.deployMonitoring({
      providers,
      certManager,
      mesh,
      longhorn,
      authentik,
    });

    return {
      output: pulumi.output({
        namespaces: {
          istio: istioHelmChart.output.namespace,
        },
        serviceMesh: {
          istioIngressGatewayLabel:
            istioHelmChart.output.istioIngressGatewayLabel,
        },
        serviceAccounts: {
          istioIngressGateway:
            istioHelmChart.output.istioIngressGatewayServiceAccountName,
        },
        gatewayPaths: {
          ingressGatewayPath: istioGateway.output.istioIngressGatewayPath,
          directGatewayPath: istioGateway.output.istioDirectGatewayPath,
        },
        storageClasses: longhornResources.output.storageClasses,
        sysbox: sysbox.output,
        lxcfs: lxcfsHelmChart.output,
        genericDevicePlugin: genericDevicePluginHelmChart.output,
        gpu: {
          runtimeClassName: gpuRuntimeClass.output.runtimeClassName,
          namespace: gpuOperatorHelmChart.output.namespace,
        },
        authentik: {
          flow: authentikResources.output.flow,
          groupIds: authentikResources.output.groupIds,
          outposts: {
            proxy: {
              id: authentikOutpost.output.outpostIds.proxyOutpostId,
              providerName: phases.authentikNames.proxyOutpostProviderName,
            },
          },
        },
        vaultSecretsOperator: {
          namespace: vaultSecretsOperatorHelmChart.output.namespace,
          vaultConnectionRef:
            vaultSecretsOperatorResources.output.vaultConnectionRef,
        },
        vault: {
          host: cloudflareContract.output.zones.ayteneve93com.records.vault,
          coderJwt: {
            mountPath: vaultCoderJwt.output.jwt.mountPath,
            roleName: vaultCoderJwt.output.jwt.roleName,
          },
          identityGroupIds: vaultIdentityTiers.output.identityGroupIds,
        },
        pcloudBackup: {
          clusterName: pcloudBackupPlatform.output.clusterName,
          configMapName: pcloudBackupPlatform.output.configMapName,
          namespace: pcloudBackupPlatform.output.namespace,
          credentialsSecretName:
            pcloudBackupPlatform.output.credentialsSecretName,
          slackSecretName: pcloudBackupPlatform.output.slackSecretName,
          drLeaseName: pcloudBackupPlatform.output.drLeaseName,
          mediaLeaseName: pcloudBackupPlatform.output.mediaLeaseName,
          volumeSnapshotClassName:
            pcloudBackupPlatform.output.volumeSnapshotClassName,
        },
        vaultBackup: {
          cronJobName: vaultBackup.output.dr.cronJobName,
          onceJobNames: vaultBackup.output.dr.onceJobNames,
          kubernetesAuthRoleName: vaultBackup.output.kubernetesAuthRoleName,
        },
      }),
      secret: pulumi.secret({
        providerConfigs: {
          authentik: authentikHelmChart.secret.authentikProviderConfig,
          vault: vaultServiceMesh.secret.vaultProviderConfig,
        },
        vault: {
          oidcMountAccessor: vaultAuthentik.output.oidc.mountAccessor,
          coderJwtMountAccessor: vaultCoderJwt.output.jwt.mountAccessor,
          kvMount: vaultResources.output.kv.mountPath,
          kubernetesAuthMountPath: vaultKubernetesAuth.output.mountPath,
          ssh: {
            userCaMount: vaultResources.output.ssh.userCaMount,
            hostCaMount: vaultResources.output.ssh.hostCaMount,
          },
          cluster: {
            address: vaultServer.clusterAddress,
            tlsServerName: vaultHelmChart.output.tls.serverName,
            namespace: vaultHelmChart.output.namespace,
            rootCaSecretName: vaultHelmChart.output.tls.rootCaSecretName,
          },
        },
      }),
    };
  },
);
