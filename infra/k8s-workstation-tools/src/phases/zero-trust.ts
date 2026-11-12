import * as nexus from '@common/nexus';
import * as utils from '@common/utils';
import { cloudflareContract } from '@infra/cloudflare/src/contract';
import { k8sWorkstationSystemContract } from '@infra/k8s-workstation-system/src/contract';
import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';
import * as components from '../components';
import { ToolsProviders } from './providers';

/**
 * Cloudflare Zero Trust — WARP + Authentik MFA로 LAN 대상(RDP) 접근, 공인 inbound 포트 없음.
 * @see docs/superpowers/specs/2026-10-18-cloudflare-zero-trust-rdp-design.md
 */
export const deployZeroTrust = (deps: { providers: ToolsProviders }) => {
  const commonEsc = nexus.esc.commonEsc;
  const cloudflareEsc = nexus.esc.cloudflareEsc;
  const { workstationK8sProvider, authentikProvider } = deps.providers;

  const authentikHost =
    cloudflareContract.output.zones.ayteneve93com.records.auth;

  const cloudflareProvider = new cloudflare.Provider('cloudflareProvider', {
    apiToken: cloudflareEsc.esc.apiToken,
  });
  const zeroTrustTeamName = cloudflareEsc.esc.zeroTrust.teamName;
  const cloudflareAccountId = cloudflare.getZoneOutput(
    { zoneId: cloudflareEsc.esc.zones.ayteneve93com.id },
    { provider: cloudflareProvider },
  ).account.id;
  const workstationMainPcIp = commonEsc.esc.workstationMainPcIp;
  const windowsRdpFqdn = pulumi.interpolate`windows.${cloudflareContract.output.zones.ayteneve93com.domain}`;

  const zeroTrustAuthentik =
    new components.zeroTrust.ZeroTrustAuthentikComponent(
      'zeroTrustAuthentik',
      {
        hosts: {
          authentik: authentikHost,
        },
        teamName: zeroTrustTeamName,
        authentik: {
          allowedGroupId:
            k8sWorkstationSystemContract.output.authentik.groupIds
              .toolsManagerGroup,
          flow: {
            authorizationFlowId:
              k8sWorkstationSystemContract.output.authentik.flow
                .defaultProviderAuthorizationImplicitConsentId,
            invalidationFlowId:
              k8sWorkstationSystemContract.output.authentik.flow
                .defaultInvalidationFlowId,
          },
        },
        providers: {
          authentik: authentikProvider,
        },
      },
    );

  const zeroTrustAccess = new components.zeroTrust.ZeroTrustAccessComponent(
    'zeroTrustAccess',
    {
      accountId: cloudflareAccountId,
      teamName: zeroTrustTeamName,
      warpAuthSessionDuration: '24h',
      identityProvider: {
        clientId: zeroTrustAuthentik.secret.oidc.clientId,
        clientSecret: zeroTrustAuthentik.secret.oidc.clientSecret,
        authUrl: zeroTrustAuthentik.output.oidc.authUrl,
        tokenUrl: zeroTrustAuthentik.output.oidc.tokenUrl,
        certsUrl: zeroTrustAuthentik.output.oidc.certsUrl,
      },
      allowedEmails: cloudflareEsc.esc.zeroTrust.allowedEmails,
      splitTunnelIncludes: [
        {
          address: pulumi.interpolate`${workstationMainPcIp}/32`,
          description: 'Workstation main PC (RDP, SSH)',
        },
        {
          host: pulumi.interpolate`${zeroTrustTeamName}.cloudflareaccess.com`,
          description: 'Zero Trust team domain',
        },
      ],
      localDomainFallbacks:
        cloudflareEsc.esc.zeroTrust.localDomainFallbacks,
      providers: {
        cloudflare: cloudflareProvider,
      },
    },
    {
      dependsOn: [zeroTrustAuthentik],
    },
  );

  const zeroTrustTunnel = new components.zeroTrust.ZeroTrustTunnelComponent(
    'zeroTrustTunnel',
    {
      accountId: cloudflareAccountId,
      tunnelName: 'workstation',
      privateRoutes: [
        {
          id: 'workstationMainPc',
          network: pulumi.interpolate`${workstationMainPcIp}/32`,
          comment: 'Workstation main PC (RDP, SSH)',
        },
      ],
      providers: {
        cloudflare: cloudflareProvider,
      },
    },
  );

  const zeroTrustGateway = new components.zeroTrust.ZeroTrustGatewayComponent(
    'zeroTrustGateway',
    {
      accountId: cloudflareAccountId,
      allowedEmails: cloudflareEsc.esc.zeroTrust.allowedEmails,
      basePrecedence: 2000,
      targets: [
        {
          id: 'workstationMainPcRdp',
          fqdn: windowsRdpFqdn,
          ip: workstationMainPcIp,
          // 3389: RDP, 8022: WSL sshd (mirrored)
          ports: [3389, 8022],
        },
      ],
      providers: {
        cloudflare: cloudflareProvider,
      },
    },
  );

  const zeroTrustConnector =
    new components.zeroTrust.ZeroTrustConnectorComponent(
      'zeroTrustConnector',
      {
        tunnelToken: zeroTrustTunnel.secret.tunnelToken,
        image: utils.configs.containerImages.cloudflared,
        replicas: 2,
        providers: {
          kubernetes: workstationK8sProvider,
        },
      },
      {
        dependsOn: [zeroTrustTunnel],
      },
    );

  return {
    cloudflareProvider,
    zeroTrustAuthentik,
    zeroTrustAccess,
    zeroTrustTunnel,
    zeroTrustGateway,
    zeroTrustConnector,
  };
};
