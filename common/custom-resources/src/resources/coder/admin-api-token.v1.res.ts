import fs from 'node:fs';
import path from 'node:path';
import * as utils from '@common/utils/src';
import * as command from '@pulumi/command';
import * as pulumi from '@pulumi/pulumi';

const CUSTOM_RESOURCES_PACKAGE_NAME = '@common/custom-resources';

export interface ResolveAdminApiTokenV1Args {
  namespace: string;
  /** Helm label `app.kubernetes.io/name` (예: coder) */
  podAppName: string;
  containerName: string;
  /** Pod 내부 coderd listen URL (예: http://127.0.0.1:8080) */
  coderLocalUrl: string;
  kubeconfig: string;
  adminUser: {
    email: string;
    username: string;
    fullName: string;
    password: string;
  };
  tokenName: string;
  /** API token lifetime (hours) */
  tokenLifetimeHours: number;
  /** Command 재실행 버킷 간격 (minutes) — Vault BootstrapToken과 동일 */
  expirationMinutes: number;
}

export type ResolveAdminApiTokenV1Result = {
  token: string;
  tokenId: string;
  /** Coder default organization UUID — coderd provider `defaultOrganizationId`용 */
  organizationId: string;
};

export type AdminApiTokenV1Args =
  utils.types.DeepPulumiInput<ResolveAdminApiTokenV1Args>;

const ADMIN_API_TOKEN_SCRIPT = 'admin-api-token.v1.script.ts';

function resolveAdminApiTokenScriptPath(): string {
  let dir = __dirname;

  while (true) {
    const packageJsonPath = path.join(dir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(
        fs.readFileSync(packageJsonPath, 'utf8'),
      ) as { name?: string };
      if (pkg.name === CUSTOM_RESOURCES_PACKAGE_NAME) {
        const scriptPath = path.join(dir, 'scripts', ADMIN_API_TOKEN_SCRIPT);
        if (fs.existsSync(scriptPath)) {
          return scriptPath;
        }
        throw new Error(`admin api token script not found: ${scriptPath}`);
      }
    }

    const parentDir = path.dirname(dir);
    if (parentDir === dir) {
      break;
    }
    dir = parentDir;
  }

  throw new Error(
    `could not resolve admin api token script from ${__dirname}`,
  );
}

/**
 * Coder admin API token — `kubectl exec` 스크립트를 Command로 실행.
 *
 * preview는 state stdout을 재사용하고, ROTATION_BUCKET 또는 입력 변경 시에만
 * create/update 스크립트가 재실행됩니다. `token` / `tokenId`를 Output으로 노출합니다.
 */
export class AdminApiTokenV1 extends command.local.Command {
  readonly token: pulumi.Output<string>;
  readonly tokenId: pulumi.Output<string>;
  readonly organizationId: pulumi.Output<string>;

  constructor(
    name: string,
    args: AdminApiTokenV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    const scriptPath = resolveAdminApiTokenScriptPath();

    const environment = pulumi.all([args]).apply(([resolved]) => ({
      ADMIN_API_TOKEN_ARGS: JSON.stringify(
        resolved satisfies ResolveAdminApiTokenV1Args,
      ),
      // result schema 변경(organizationId 추가) 시 Command 재실행 유도
      RESULT_SCHEMA_VERSION: '2',
      ROTATION_BUCKET: String(
        Math.floor(Date.now() / (resolved.expirationMinutes * 60 * 1000)),
      ),
    }));

    const run = `node -r ts-node/register/transpile-only "${scriptPath}"`;

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

    const parsed = this.stdout.apply(stdout => {
      const result = JSON.parse(stdout.trim()) as {
        token?: string;
        tokenId?: string;
        organizationId?: string;
      };
      if (
        !result.token?.trim() ||
        !result.tokenId?.trim() ||
        !result.organizationId?.trim()
      ) {
        throw new Error(
          'admin api token command returned empty token, tokenId, or organizationId',
        );
      }
      return {
        token: result.token,
        tokenId: result.tokenId,
        organizationId: result.organizationId,
      };
    });

    this.token = pulumi.secret(parsed.apply(value => value.token));
    this.tokenId = parsed.apply(value => value.tokenId);
    this.organizationId = parsed.apply(value => value.organizationId);
  }
}
