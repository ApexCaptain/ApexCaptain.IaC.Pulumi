import fs from 'node:fs';
import path from 'node:path';
import * as utils from '@common/utils/src';
import * as command from '@pulumi/command';
import * as pulumi from '@pulumi/pulumi';

const CUSTOM_RESOURCES_PACKAGE_NAME = '@common/custom-resources';

export interface ResolveBootstrapTokenV1Args {
  namespace: string;
  /** Helm label `app.kubernetes.io/name` (예: vault) */
  podName: string;
  containerName: string;
  /** Vault Service 이름 — VAULT_ADDR·인증서 SAN과 일치해야 함 */
  serviceName: string;
  servicePort: number;
  kubeconfig: string;
  /** Pod 내 bootstrap enc 파일 디렉터리 (예: /vault/data) */
  tokenDirPath: string;
  /** ESC 등에서 주입하는 정적 키 — enc 파일 암·복호화에 사용 */
  bootstrapTokenEncryptionKey: string;
  expirationMinutes: number;
  /** cert-manager Secret 이름 — `/vault/userconfig/{name}/ca.crt` 마운트 경로와 일치 */
  vaultServerCertificateSecretName: string;
}

export type ResolveBootstrapTokenV1Result = {
  token: string;
};

export type BootstrapTokenV1Args =
  utils.types.DeepPulumiInput<ResolveBootstrapTokenV1Args>;

const BOOTSTRAP_TOKEN_SCRIPT = 'bootstrap-token.v1.script.ts';

/** Command subprocess — `scripts/`의 TS를 ts-node로 실행 */
function resolveBootstrapTokenScriptPath(): string {
  let dir = __dirname;

  while (true) {
    const packageJsonPath = path.join(dir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(
        fs.readFileSync(packageJsonPath, 'utf8'),
      ) as { name?: string };
      if (pkg.name === CUSTOM_RESOURCES_PACKAGE_NAME) {
        const scriptPath = path.join(dir, 'scripts', BOOTSTRAP_TOKEN_SCRIPT);
        if (fs.existsSync(scriptPath)) {
          return scriptPath;
        }
        throw new Error(
          `bootstrap token script not found: ${scriptPath}`,
        );
      }
    }

    const parentDir = path.dirname(dir);
    if (parentDir === dir) {
      break;
    }
    dir = parentDir;
  }

  throw new Error(
    `could not resolve bootstrap token script from ${__dirname}`,
  );
}

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
    const scriptPath = resolveBootstrapTokenScriptPath();

    const environment = pulumi.all([args]).apply(([resolved]) => ({
      BOOTSTRAP_ARGS: JSON.stringify(resolved satisfies ResolveBootstrapTokenV1Args),
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
