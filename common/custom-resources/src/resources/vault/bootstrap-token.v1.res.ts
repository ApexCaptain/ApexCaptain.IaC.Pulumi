import path from 'node:path';
import * as utils from '@common/utils/src';
import * as command from '@pulumi/command';
import * as pulumi from '@pulumi/pulumi';
import type { ResolveBootstrapTokenV1Args } from '../../data/vault/bootstrap-token.logic';

export type BootstrapTokenV1Args =
  utils.types.DeepPulumiInput<ResolveBootstrapTokenV1Args>;

/**
 * Vault bootstrap token — Command stdout을 state에 고정.
 *
 * preview는 state의 token을 재사용하고, rotation interval 경계(ROTATION_BUCKET) 또는
 * 입력 변경 시에만 create/update 스크립트가 재실행됩니다.
 */
export class BootstrapTokenV1 extends command.local.Command {
  readonly token: pulumi.Output<string>;

  constructor(
    name: string,
    args: BootstrapTokenV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    const scriptPath = path.join(__dirname, 'bootstrap-token.script.js');

    const environment = pulumi.all([args]).apply(([resolved]) => ({
      BOOTSTRAP_ARGS: JSON.stringify(resolved satisfies ResolveBootstrapTokenV1Args),
      ROTATION_BUCKET: String(
        Math.floor(Date.now() / (resolved.expirationMinutes * 60 * 1000)),
      ),
    }));

    const run = `node "${scriptPath}"`;

    super(
      name,
      {
        create: run,
        update: run,
        environment,
      },
      {
        ...opts,
        additionalSecretOutputs: ['stdout'],
      },
    );

    this.token = pulumi.secret(
      this.stdout.apply(stdout => {
        const parsed = JSON.parse(stdout.trim()) as { token?: string };
        if (!parsed.token?.trim()) {
          throw new Error('bootstrap token command returned empty token');
        }
        return parsed.token;
      }),
    );
  }
}
