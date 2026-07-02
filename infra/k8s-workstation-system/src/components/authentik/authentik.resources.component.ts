/**
 * Authentik IdP 리소스 — 그룹·플로우·OAuth·K8s ServiceConnection
 *
 * Outpost는 여기서 만들지 않는다 (Longhorn provider bootstrap은 authentikOutpost).
 * 그룹 tier: system / tools / application — apps·tools contract가 groupId를 참조.
 */
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
    /**
     * Authentik Outpost가 클러스터에 프록시/앱을 배포할 때 참조하는 K8s 연결 정보.
     * Helm 설치 시 Authentik 기본값으로 생성되므로 lookup만 한다.
     */
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

    /**
     * Authentik 기본 Flow lookup.
     * OAuth Source·Provider 등에서 slug로 참조하며, 여기서는 ID만 외부 컴포넌트에 넘긴다.
     */
    // OIDC/SAML 등 Provider가 앱 접근 허용 시 거치는 authorization flow (동의 화면 생략 버전)
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

    // 로그아웃 시 세션·쿠키를 정리하는 invalidation flow
    const dataDefaultInvalidationFlow = await authentik.getFlow(
      {
        slug: 'default-invalidation-flow',
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    // OAuth Source로 이미 가입된 사용자가 다시 로그인할 때 사용하는 flow
    const dataDefaultSourceAuthenticationFlow = await authentik.getFlow(
      {
        slug: 'default-source-authentication',
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    // OAuth Source로 처음 로그인하는 사용자를 Authentik에 등록(enroll)하는 flow
    const dataDefaultSourceEnrollmentFlow = await authentik.getFlow(
      {
        slug: 'default-source-enrollment',
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    /**
     * Google OAuth Source.
     * 로그인 화면(Identification stage)에서 "Google로 계속" 버튼을 제공하고,
     * 기존 사용자 → authenticationFlow, 신규 사용자 → enrollmentFlow 로 분기한다.
     */
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

    /**
     * 권한 tier 그룹 트리.
     *
     * Application / Tools 두 축이 있고, 각 축은 User → Manager 로 올라간다.
     * System tier는 두 Manager 그룹의 **공통 자식**으로 붙어, 두 축의 descendant 체인에 동시에 속한다.
     *
     * ```
     * applicationUser
     *   └── applicationManager ──┐
     *                            ├── systemUser
     * toolsUser                  │     └── systemManager
     *   └── toolsManager ────────┘
     * ```
     *
     * 주의: parents를 둘 다 지정해도 "양쪽 Manager에 이미 속한 사람만 System에 들어갈 수 있다"는
     * 교집합 조건이 되지는 않는다. System 그룹에 직접 넣어야 하며, 넣으면 자식→부모 상속으로
     * applicationManager·toolsManager(및 그 상위 user 그룹) 멤버로도 간주된다.
     *
     * Authentik 앱 bind는 bind 대상 그룹의 자식(descendants)에게만 access가 퍼진다.
     * 권한이 높을수록 tree 아래(child)에 두면, 상위 tier 앱 bind 시 하위 그룹 멤버는 제외된다.
     */
    // 일반 앱 접근 tier. 신규 가입자는 enrollment User Write stage에서 자동 배정된다.
    const applicationUserGroup = new authentik.Group(
      `${resourceName}-applicationUserGroup`,
      {
        name: 'Application User',
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    // Application User의 상위 tier. 앱 관리·고권한 앱 bind 대상.
    const applicationManagerGroup = new authentik.Group(
      `${resourceName}-applicationManagerGroup`,
      {
        name: 'Application Manager',
        parents: [applicationUserGroup.id],
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    // 인프라/운영 도구 접근 tier (Application 축과 독립)
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

    // Tools User의 상위 tier
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

    // 두 Manager 축의 공통 자식. 멤버는 양쪽 Manager·User 그룹 상속 멤버로도 취급됨.
    const systemUserGroup = new authentik.Group(
      `${resourceName}-systemUserGroup`,
      {
        name: 'System User',
        parents: [applicationManagerGroup.id, toolsManagerGroup.id],
      },
      {
        ...opts,
        provider: args.providers.authentik,
      },
    );

    // System tier 최상위. 클러스터/IdP 전역 관리 권한 bind 대상.
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

    /**
     * Flow Stage 오버라이드.
     * Authentik 기본 stage를 import한 뒤 필요한 필드만 덮어쓴다.
     */
    // 기본 로그인 flow의 첫 단계. 이메일/유저명 입력 + federated source(Google) 버튼 표시.
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

    /**
     * default-source-enrollment flow 마지막 단계.
     * OAuth 신규 사용자 생성 시 userType·기본 그룹을 여기서 결정한다.
     */
    const dataDefaultSourceEnrollmentWrite = await authentik.getStage(
      { name: 'default-source-enrollment-write' },
      { ...opts, provider: args.providers.authentik },
    );

    new authentik.StageUserWrite(
      `${resourceName}-defaultSourceEnrollmentWrite`,
      {
        name: dataDefaultSourceEnrollmentWrite.name,
        userCreationMode: 'always_create', // OAuth 첫 로그인 시 항상 신규 사용자 생성
        createUsersAsInactive: false, // 생성 즉시 활성화 (기본값 true)
        userType: 'internal', // external(기본) 대신 internal user로 분류
        createUsersGroup: applicationUserGroup.id, // Application User 그룹 자동 배정
      },
      {
        ...opts,
        provider: args.providers.authentik,
        import: dataDefaultSourceEnrollmentWrite.id,
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

          toolsManagerGroup: toolsManagerGroup.id,
          toolsUserGroup: toolsUserGroup.id,

          applicationManagerGroup: applicationManagerGroup.id,
          applicationUserGroup: applicationUserGroup.id,
        },
      }),
      secret: pulumi.secret({}),
    };
  },
);
