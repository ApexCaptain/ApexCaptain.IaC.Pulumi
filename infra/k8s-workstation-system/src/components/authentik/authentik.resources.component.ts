import * as utils from '@common/utils/src';
import * as authentik from '@pulumi/authentik';
import * as pulumi from '@pulumi/pulumi';

interface AuthentikResourcesComponentArgsShape {
  providers: {
    authentik: authentik.Provider;
  };
}

export type AuthentikResourcesComponentArgs =
  utils.types.DeepPulumiInput<AuthentikResourcesComponentArgsShape>;

export const AuthentikResourcesComponent = utils.functions.defineComponent(
  'authentikResources',
  async (
    args: AuthentikResourcesComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    // Helm 깔면 Authentik이 "Local Kubernetes Cluster" connection 알아서 만들어 둠.
    // proxy outpost 띄울 때 worker가 이 설정 보고 K8s API 호출함 → ak-outpost-* Service 생김.
    //
    // verifySsl false인 이유:
    // MicroK8s CA에 Key Usage가 없는데 worker는 Python 3.13+라 TLS 검증 빡셈.
    // 로그에 "CA cert does not include key usage extension" 뜨고 outpost는 사용 불가, torrent는 RBAC denied.
    // kubectl은 멀쩡한데 authentik worker만 죽는 그림.
    //
    // 일단 verifySsl 옵션 비활성화. (클러스터 내부 API만 해당, authentik 웹 HTTPS랑 무관).
    // get + import는 Helm이 만든 connection을 Pulumi state에 붙이려고.
    //
    // TODO: 시간 나면 CA refresh-certs로 keyUsage 넣은 걸로 갈아끼고 verifySsl 다시 켜보기.
    const dataLocalKubernetesCluster =
      await authentik.getServiceConnectionKubernetes(
        {
          name: 'Local Kubernetes Cluster',
        },
        {
          ...opts,
          provider: args.providers.authentik,
        },
      );

    const localKubernetesCluster = new authentik.ServiceConnectionKubernetes(
      `${resourceName}-localKubernetesCluster`,
      {
        name: 'Local Kubernetes Cluster',
        local: true,
        verifySsl: false,
      },
      {
        ...opts,
        provider: args.providers.authentik,
        import: dataLocalKubernetesCluster.id,
      },
    );

    const dataDefaultProviderAuthorizationImplicitConsent =
      await authentik.getFlow(
        {
          slug: 'default-provider-authorization-implicit-consent',
        },
        {
          ...opts,
          provider: args.providers.authentik,
        },
      );

    const dataDefaultInvalidationFlow = await authentik.getFlow(
      {
        slug: 'default-invalidation-flow',
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    return {
      output: pulumi.output({
        serviceConnections: {
          localKubernetesClusterId: localKubernetesCluster.id,
        },
        flow: {
          defaultProviderAuthorizationImplicitConsentId:
            dataDefaultProviderAuthorizationImplicitConsent.id,
          defaultInvalidationFlowId: dataDefaultInvalidationFlow.id,
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
