// Istio(ext-authz)·Authentik·proxy 앱이 공유하는 Authentik 이름. 리소스 생성 전에 정해야 해서 상수로 둔다.
export const authentikNames = {
  namespace: 'authentik',
  proxyOutpostName: 'authentik-proxy-outpost',
  proxyOutpostProviderName: 'authentik-proxy-outpost-provider',
};
