import { authentik } from '@common/bridged-provider';
import * as customResources from '@common/custom-resources/src';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import dedent from 'dedent';

interface AuthentikResourcesComponentArgsShape {
  isFirstDeploy: boolean;
  oauth: {
    google: {
      clientId: string;
      clientSecret: string;
    };
  };

  allowedEmails: string[];
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

    // K8s Service Connection
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

    // Policies
    const dataDefaultSourceEnrollmentIfSsoPolicyExpression =
      customResources.data.authentik.getPolcyExpressionV1({
        name: 'default-source-enrollment-if-sso',
        authentikUrl: args.providers.authentik.url,
        authentikToken: args.providers.authentik.token,
      });

    const defaultSourceEnrollmentIfSsoPolicyExpression = pulumi
      .all([
        args.allowedEmails,
        dataDefaultSourceEnrollmentIfSsoPolicyExpression,
      ])
      .apply(
        ([
          resolvedAllowedEmails,
          resolvedDtaDefaultSourceEnrollmentIfSsoPolicyExpression,
        ]) => {
          return new authentik.PolicyExpression(
            `${resourceName}-defaultSourceEnrollmentIfSsoPolicyExpression`,
            {
              name: resolvedDtaDefaultSourceEnrollmentIfSsoPolicyExpression.name,
              expression: dedent`
                allowed_emails = ${JSON.stringify(resolvedAllowedEmails)}
                if not allowed_emails or request.context["prompt_data"]["email"] in allowed_emails:
                  return ak_is_sso_flow
                else:
                  return False
              `,
            },
            {
              ...opts,
              provider: args.providers.authentik,
              import: args.isFirstDeploy
                ? resolvedDtaDefaultSourceEnrollmentIfSsoPolicyExpression.pk
                : undefined,
            },
          );
        },
      );

    const dataDefaultSourceAuthenticationIfSsoPolicyExpression =
      customResources.data.authentik.getPolcyExpressionV1({
        name: 'default-source-authentication-if-sso',
        authentikUrl: args.providers.authentik.url,
        authentikToken: args.providers.authentik.token,
      });

    const defaultSourceAuthenticationIfSsoPolicyExpression = pulumi
      .all([
        args.allowedEmails,
        dataDefaultSourceAuthenticationIfSsoPolicyExpression,
      ])
      .apply(
        ([
          resolvedAllowedEmails,
          resolvedDtaDefaultSourceAuthenticationIfSsoPolicyExpression,
        ]) => {
          return new authentik.PolicyExpression(
            `${resourceName}-defaultSourceAuthenticationIfSsoPolicyExpression`,
            {
              name: resolvedDtaDefaultSourceAuthenticationIfSsoPolicyExpression.name,
              expression: dedent`
                allowed_emails = ${JSON.stringify(resolvedAllowedEmails)}

                if not allowed_emails or request.context["prompt_data"]["email"] in allowed_emails:
                  return ak_is_sso_flow
                else:
                  return False
              `,
            },
            {
              ...opts,
              provider: args.providers.authentik,
              import: args.isFirstDeploy
                ? resolvedDtaDefaultSourceAuthenticationIfSsoPolicyExpression.pk
                : undefined,
            },
          );
        },
      );

    // Flows
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

    const dataDefaultSourceAuthenticationFlow = await authentik.getFlow(
      {
        slug: 'default-source-authentication',
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    const dataDefaultSourceEnrollmentFlow = await authentik.getFlow(
      {
        slug: 'default-source-enrollment',
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    // Source OAuth
    const googleSourceOauth = new authentik.SourceOauth(
      `${resourceName}-googleSourceOauth`,
      {
        name: 'Google',
        slug: 'google',
        providerType: 'google',
        consumerKey: args.oauth.google.clientId,
        consumerSecret: args.oauth.google.clientSecret,
        authenticationFlow: dataDefaultSourceAuthenticationFlow.id,
        enrollmentFlow: dataDefaultSourceEnrollmentFlow.id,
        enabled: true,
      },
      {
        ...opts,
        provider: args.providers.authentik,
        // providerType=google일 때 Authentik이 자동 채우는 computed 필드.
        // 코드에 없어서 매 preview마다 phantom update가 뜨는 걸 막음.
        ignoreChanges: [
          'accessTokenUrl',
          'authorizationUrl',
          'oidcJwksUrl',
          'profileUrl',
          'oidcJwks',
          'callbackUri',
        ],
      },
    );

    // Stages
    const dataDefaultAuthenticationIdentification = await authentik.getStage(
      {
        name: 'default-authentication-identification',
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );
    const defaultAuthenticationIdentification =
      new authentik.StageIdentification(
        `${resourceName}-defaultAuthenticationIdentification`,
        {
          name: dataDefaultAuthenticationIdentification.name,
          userFields: ['email', 'username'],
          sources: [googleSourceOauth.uuid],
          showSourceLabels: true,
        },
        {
          ...opts,
          provider: args.providers.authentik,
          import: dataDefaultAuthenticationIdentification.id,
        },
      );

    // Groups
    //
    // Authentik group binding은 bind 대상 → 자식(descendants)으로만 access가 퍼짐.
    // 권한 높을수록 tree 아래(child)에 두면, 상위 tier 앱 bind 시 하위 그룹 멤버는 제외됨.
    //
    // Tools User (root)
    //   └── Tools Manager
    //         └── System User
    //               └── System Manager

    const toolsUserGroup = new authentik.Group(
      `${resourceName}-toolsUserGroup`,
      {
        name: 'Tools User',
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    const toolsManagerGroup = new authentik.Group(
      `${resourceName}-toolsManagerGroup`,
      {
        name: 'Tools Manager',
        parents: [toolsUserGroup.id],
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    const systemUserGroup = new authentik.Group(
      `${resourceName}-systemUserGroup`,
      {
        name: 'System User',
        parents: [toolsManagerGroup.id],
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    const systemManagerGroup = new authentik.Group(
      `${resourceName}-systemManagerGroup`,
      {
        name: 'System Manager',
        parents: [systemUserGroup.id],
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
        groupIds: {
          systemManagerGroup: systemManagerGroup.id,
          systemUserGroup: systemUserGroup.id,
          toolsUserGroup: toolsUserGroup.id,
          toolsManagerGroup: toolsManagerGroup.id,
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
