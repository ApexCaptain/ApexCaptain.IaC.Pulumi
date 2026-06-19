import { authentik } from '@common/bridged-provider';
import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';

interface AuthentikResourcesComponentArgsShape {
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

    // Policies
    /**
     * Email 도메인 혹은 특정 Email 주소에 대해서만 가입/로그인 제한을 두기 위해
     * Policies Overriding을 했었는데, 쓰다보니 그럴 필요가 없어져서
     * 비활성화. 그냥 그룹별 권한 제어 방식으로 바꿈
     */
    /*
    const dataDefaultSourceEnrollmentIfSsoPolicyExpression =
      customResources.data.authentik.getPolcyExpressionV1({
        name: 'default-source-enrollment-if-sso',
        authentikUrl: args.providers.authentik.url,
        authentikToken: args.providers.authentik.token,
      });

    await pulumi.log.info(
      JSON.stringify(dataDefaultSourceEnrollmentIfSsoPolicyExpression, null, 2),
    );

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
    */

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
          localKubernetesClusterId: dataLocalKubernetesCluster.id,
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
