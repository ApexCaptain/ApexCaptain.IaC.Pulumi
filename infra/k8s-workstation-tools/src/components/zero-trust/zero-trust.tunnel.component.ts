/**
 * Cloudflare Tunnel (remotely managed) + private network route.
 *
 * public hostname(ingress)은 쓰지 않는다. WARP 사용자의 private 트래픽만
 * route(`/32`)로 이 터널에 붙고, connector(cloudflared)가 LAN으로 전달한다.
 * 토큰은 connector 컴포넌트가 K8s Secret으로 주입한다.
 */
import * as utils from '@common/utils/src';
import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';

interface ZeroTrustTunnelPrivateRouteShape {
  /** 리소스 이름용 고정 id (network 값은 secret Output일 수 있어 이름에 쓰지 않는다) */
  id: string;
  network: string;
  comment: string;
}

interface ZeroTrustTunnelComponentArgsShape {
  accountId: string;
  tunnelName: string;
  providers: {
    cloudflare: cloudflare.Provider;
  };
}

export type ZeroTrustTunnelComponentArgs =
  utils.types.DeepPulumiInput<ZeroTrustTunnelComponentArgsShape> & {
    /** preview에 route가 보이도록 concrete 배열 (Output 금지) */
    privateRoutes: ({ id: string } & utils.types.DeepPulumiInput<
      Omit<ZeroTrustTunnelPrivateRouteShape, 'id'>
    >)[];
  };

export const ZeroTrustTunnelComponent = utils.functions.defineComponent(
  'zeroTrustTunnel',
  (
    args: ZeroTrustTunnelComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const providerOpts = { ...opts, provider: args.providers.cloudflare };

    const tunnel = new cloudflare.ZeroTrustTunnelCloudflared(
      `${resourceName}-tunnel`,
      {
        accountId: args.accountId,
        name: args.tunnelName,
        configSrc: 'cloudflare',
      },
      providerOpts,
    );

    for (const privateRoute of args.privateRoutes) {
      new cloudflare.ZeroTrustTunnelCloudflaredRoute(
        `${resourceName}-${privateRoute.id}-route`,
        {
          accountId: args.accountId,
          tunnelId: tunnel.id,
          network: privateRoute.network,
          comment: privateRoute.comment,
        },
        providerOpts,
      );
    }

    const tunnelToken = cloudflare.getZeroTrustTunnelCloudflaredTokenOutput(
      {
        accountId: args.accountId,
        tunnelId: tunnel.id,
      },
      providerOpts,
    ).token;

    return {
      output: pulumi.output({
        tunnelId: tunnel.id,
      }),
      secret: pulumi.secret({
        tunnelToken,
      }),
    };
  },
);
