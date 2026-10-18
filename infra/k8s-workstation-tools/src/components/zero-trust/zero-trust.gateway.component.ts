/**
 * Cloudflare Gateway 정책 — private 대상별 DNS override + network allow/block.
 *
 * ```
 * WARP DNS  : <fqdn> → override → <ip>   (공개 DNS 레코드 없음)
 * WARP L4   : <ip>:<ports> + identity.email ∈ allowedEmails → allow
 *             <ip> (그 외 전부)                              → block
 * ```
 *
 * Gateway 기본 동작이 allow라 대상 IP block을 allow 다음 precedence에 명시한다.
 * precedence는 계정 전체에서 유일해야 한다. 활성화 시 생긴 기본 규칙(0, 10000)과 겹치지 않게
 * `basePrecedence`부터 대상마다 10씩 띄운다.
 */
import * as utils from '@common/utils/src';
import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';

interface ZeroTrustGatewayTargetShape {
  /** 리소스 이름용 고정 id */
  id: string;
  fqdn: string;
  ip: string;
  ports: number[];
}

interface ZeroTrustGatewayComponentArgsShape {
  accountId: string;
  allowedEmails: string[];
  basePrecedence: number;
  providers: {
    cloudflare: cloudflare.Provider;
  };
}

export type ZeroTrustGatewayComponentArgs =
  utils.types.DeepPulumiInput<ZeroTrustGatewayComponentArgsShape> & {
    /** preview에 정책이 보이도록 concrete 배열 (Output 금지) */
    targets: ({ id: string } & utils.types.DeepPulumiInput<
      Omit<ZeroTrustGatewayTargetShape, 'id'>
    >)[];
  };

export const ZeroTrustGatewayComponent = utils.functions.defineComponent(
  'zeroTrustGateway',
  (
    args: ZeroTrustGatewayComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const providerOpts = { ...opts, provider: args.providers.cloudflare };

    const allowedEmailsExpression = pulumi
      .output(args.allowedEmails)
      .apply(
        emails =>
          `identity.email in {${emails.map(email => JSON.stringify(email)).join(' ')}}`,
      );

    args.targets.forEach((target, index) => {
      const precedence = pulumi
        .output(args.basePrecedence)
        .apply(basePrecedence => basePrecedence + index * 10);

      new cloudflare.ZeroTrustGatewayPolicy(
        `${resourceName}-${target.id}-dnsOverridePolicy`,
        {
          accountId: args.accountId,
          name: `${target.id}: DNS override`,
          description: 'Resolve private hostname for WARP users only',
          enabled: true,
          action: 'override',
          filters: ['dns'],
          traffic: pulumi.interpolate`dns.fqdn == "${target.fqdn}"`,
          ruleSettings: {
            overrideIps: [target.ip],
          },
          precedence,
        },
        providerOpts,
      );

      new cloudflare.ZeroTrustGatewayPolicy(
        `${resourceName}-${target.id}-networkAllowPolicy`,
        {
          accountId: args.accountId,
          name: `${target.id}: allow`,
          description: 'Allow listed identities to the private target ports',
          enabled: true,
          action: 'allow',
          filters: ['l4'],
          traffic: pulumi.interpolate`net.dst.ip == ${target.ip} and net.dst.port in {${pulumi
            .output(target.ports)
            .apply(ports => ports.join(' '))}}`,
          identity: allowedEmailsExpression,
          precedence: precedence.apply(value => value + 1),
        },
        providerOpts,
      );

      new cloudflare.ZeroTrustGatewayPolicy(
        `${resourceName}-${target.id}-networkBlockPolicy`,
        {
          accountId: args.accountId,
          name: `${target.id}: block`,
          description: 'Block everything else to the private target',
          enabled: true,
          action: 'block',
          filters: ['l4'],
          traffic: pulumi.interpolate`net.dst.ip == ${target.ip}`,
          precedence: precedence.apply(value => value + 2),
        },
        providerOpts,
      );
    });

    return {
      output: pulumi.output({}),
      secret: pulumi.secret({}),
    };
  },
);
