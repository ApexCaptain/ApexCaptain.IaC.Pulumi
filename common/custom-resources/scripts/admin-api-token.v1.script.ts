/**
 * Coder admin API token resolve script (v1)
 *
 * Pulumi Command subprocess entry. `kubectl exec` + Pod localhost curl로
 * first-user 생성(필요 시) 및 named API token을 발급한다.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as utils from '@common/utils/src';
import type {
  ResolveAdminApiTokenV1Args,
  ResolveAdminApiTokenV1Result,
} from '../src/resources/coder/admin-api-token.v1.res';

const CODER_POD_RUNNING_TIMEOUT_MS = 5 * 60 * 1000;
const CODER_POD_POLL_INTERVAL_MS = 5000;
const CODER_API_READY_TIMEOUT_MS = 5 * 60 * 1000;
const KUBECTL_TIMEOUT_SECONDS = 60;

type CoderTokenInfo = {
  id: string;
  token_name?: string;
};

type CoderLoginResponse = {
  session_token?: string;
};

type CoderCreateTokenResponse = {
  key?: string;
  id?: string;
};

type CoderCreateFirstUserResponse = {
  organization_id?: string;
  user_id?: string;
};

type CoderOrganization = {
  id: string;
  name?: string;
  is_default?: boolean;
};

function hoursToNanoseconds(hours: number): number {
  return hours * 60 * 60 * 1_000_000_000;
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, '\'\"\'\"\'')}'`;
}

function resolveKubeconfigPath(kubeconfig: string): {
  kubeconfigPath: string;
  cleanup: () => void;
} {
  if (kubeconfig.trimStart().startsWith('apiVersion:')) {
    const kubeconfigPath = path.join(
      os.tmpdir(),
      `coder-admin-api-token-kubeconfig-${process.pid}.yaml`,
    );
    fs.writeFileSync(kubeconfigPath, kubeconfig, { mode: 0o600 });
    return {
      kubeconfigPath,
      cleanup: () => {
        try {
          fs.unlinkSync(kubeconfigPath);
        } catch {
          // ignore
        }
      },
    };
  }

  return {
    kubeconfigPath: kubeconfig,
    cleanup: () => undefined,
  };
}

function runKubectl(args: {
  kubeconfigPath: string;
  argv: string[];
  stdin?: string;
}): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'kubectl',
      [
        `--kubeconfig=${args.kubeconfigPath}`,
        `--request-timeout=${KUBECTL_TIMEOUT_SECONDS}s`,
        ...args.argv,
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', chunk => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on('data', chunk => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on('error', reject);
    child.on('close', code => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        code: code ?? 1,
      });
    });

    if (args.stdin != null) {
      child.stdin.write(args.stdin);
    }
    child.stdin.end();
  });
}

async function curlJsonInPod(args: {
  kubeconfigPath: string;
  namespace: string;
  podName: string;
  containerName: string;
  method: string;
  url: string;
  sessionToken?: string;
  body?: unknown;
}): Promise<{ statusCode: number; body: string }> {
  const headerLines = [`-H ${shellSingleQuote('Accept: application/json')}`];
  if (args.body !== undefined) {
    headerLines.push(`-H ${shellSingleQuote('Content-Type: application/json')}`);
  }
  if (args.sessionToken) {
    headerLines.push(
      `-H ${shellSingleQuote(`Coder-Session-Token: ${args.sessionToken}`)}`,
    );
  }

  const curlCommand =
    args.body === undefined
      ? `curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' -X ${shellSingleQuote(args.method)} ${headerLines.join(' ')} ${shellSingleQuote(args.url)}`
      : `curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' -X ${shellSingleQuote(args.method)} ${headerLines.join(' ')} --data-binary @- ${shellSingleQuote(args.url)}`;

  const script = [
    'set -eu',
    'RESPONSE_FILE=$(mktemp)',
    `HTTP_CODE=$(${curlCommand})`,
    'printf "%s\\n" "$HTTP_CODE"',
    'printf "%s\\n" "---"',
    'cat "$RESPONSE_FILE"',
    'rm -f "$RESPONSE_FILE"',
  ].join('\n');

  const result = await runKubectl({
    kubeconfigPath: args.kubeconfigPath,
    argv: [
      'exec',
      ...(args.body === undefined ? [] : ['-i']),
      '-n',
      args.namespace,
      args.podName,
      '-c',
      args.containerName,
      '--',
      'sh',
      '-ec',
      script,
    ],
    stdin: args.body === undefined ? undefined : JSON.stringify(args.body),
  });

  if (result.code !== 0) {
    throw new Error(
      `kubectl exec curl failed (code=${result.code}): ${result.stderr || result.stdout}`,
    );
  }

  const separatorIndex = result.stdout.indexOf('\n---\n');
  if (separatorIndex < 0) {
    throw new Error(
      `unexpected curl response from pod (no separator): ${result.stdout}`,
    );
  }

  const statusCode = Number.parseInt(
    result.stdout.slice(0, separatorIndex).trim(),
    10,
  );
  const body = result.stdout.slice(separatorIndex + '\n---\n'.length);
  if (Number.isNaN(statusCode)) {
    throw new Error(`failed to parse HTTP status from pod curl: ${result.stdout}`);
  }

  return { statusCode, body };
}

export async function resolveAdminApiTokenV1(
  args: ResolveAdminApiTokenV1Args,
): Promise<ResolveAdminApiTokenV1Result> {
  const {
    namespace,
    podAppName,
    containerName,
    coderLocalUrl,
    kubeconfig,
    adminUser,
    tokenName,
    tokenLifetimeHours,
  } = args;

  const { kubeconfigPath, cleanup } = resolveKubeconfigPath(kubeconfig);

  try {
    const targetPodName = await (async () => {
      const deadline = Date.now() + CODER_POD_RUNNING_TIMEOUT_MS;

      while (true) {
        const listed = await runKubectl({
          kubeconfigPath,
          argv: [
            'get',
            'pod',
            '-n',
            namespace,
            '-l',
            `app.kubernetes.io/name=${podAppName}`,
            '--field-selector=status.phase=Running',
            '-o',
            'jsonpath={.items[0].metadata.name}',
          ],
        });

        if (listed.code === 0 && listed.stdout.trim()) {
          return listed.stdout.trim();
        }

        console.warn(
          `Waiting for Coder Pod (app.kubernetes.io/name=${podAppName}) in ${namespace}`,
        );

        if (Date.now() >= deadline) {
          throw new Error(
            `Coder Pod did not become Running within ${CODER_POD_RUNNING_TIMEOUT_MS / 1000}s in namespace ${namespace}`,
          );
        }

        await utils.functions.waitForMs(CODER_POD_POLL_INTERVAL_MS);
      }
    })();

    const baseUrl = coderLocalUrl.replace(/\/$/, '');

    await (async () => {
      const deadline = Date.now() + CODER_API_READY_TIMEOUT_MS;
      while (true) {
        try {
          const { statusCode } = await curlJsonInPod({
            kubeconfigPath,
            namespace,
            podName: targetPodName,
            containerName,
            method: 'GET',
            url: `${baseUrl}/healthz`,
          });
          if (statusCode >= 200 && statusCode < 300) {
            return;
          }
          console.warn(`Coder healthz returned ${statusCode}; waiting`);
        } catch (error) {
          console.warn(`Coder healthz not ready yet: ${error}`);
        }

        if (Date.now() >= deadline) {
          throw new Error(
            `Coder API did not become ready within ${CODER_API_READY_TIMEOUT_MS / 1000}s`,
          );
        }
        await utils.functions.waitForMs(CODER_POD_POLL_INTERVAL_MS);
      }
    })();

    const firstUserStatus = await curlJsonInPod({
      kubeconfigPath,
      namespace,
      podName: targetPodName,
      containerName,
      method: 'GET',
      url: `${baseUrl}/api/v2/users/first`,
    });

    if (firstUserStatus.statusCode === 404) {
      console.warn('Creating Coder first user');
      const createFirstUser = await curlJsonInPod({
        kubeconfigPath,
        namespace,
        podName: targetPodName,
        containerName,
        method: 'POST',
        url: `${baseUrl}/api/v2/users/first`,
        body: {
          email: adminUser.email,
          username: adminUser.username,
          name: adminUser.fullName,
          password: adminUser.password,
          trial: false,
        },
      });
      if (
        createFirstUser.statusCode !== 201 &&
        createFirstUser.statusCode !== 200
      ) {
        throw new Error(
          `failed to create first user (${createFirstUser.statusCode}): ${createFirstUser.body}`,
        );
      }
    } else if (
      firstUserStatus.statusCode !== 200 &&
      firstUserStatus.statusCode !== 201
    ) {
      throw new Error(
        `failed to check first user (${firstUserStatus.statusCode}): ${firstUserStatus.body}`,
      );
    }

    const login = await curlJsonInPod({
      kubeconfigPath,
      namespace,
      podName: targetPodName,
      containerName,
      method: 'POST',
      url: `${baseUrl}/api/v2/users/login`,
      body: {
        email: adminUser.email,
        password: adminUser.password,
      },
    });
    if (login.statusCode !== 201 && login.statusCode !== 200) {
      throw new Error(
        `failed to login as admin (${login.statusCode}): ${login.body}`,
      );
    }
    const sessionToken = (JSON.parse(login.body) as CoderLoginResponse)
      .session_token?.trim();
    if (!sessionToken) {
      throw new Error('login response did not include session_token');
    }

    const organizations = await curlJsonInPod({
      kubeconfigPath,
      namespace,
      podName: targetPodName,
      containerName,
      method: 'GET',
      url: `${baseUrl}/api/v2/organizations`,
      sessionToken,
    });
    if (organizations.statusCode !== 200) {
      throw new Error(
        `failed to list organizations (${organizations.statusCode}): ${organizations.body}`,
      );
    }
    const organizationList = JSON.parse(
      organizations.body,
    ) as CoderOrganization[];
    if (!Array.isArray(organizationList) || organizationList.length === 0) {
      throw new Error('no Coder organizations returned for admin session');
    }
    const organizationId = (
      organizationList.find(organization => organization.is_default) ??
      organizationList[0]
    ).id?.trim();
    if (!organizationId) {
      throw new Error('Coder organization id is empty');
    }

    const deleteTokenById = async (tokenId: string): Promise<void> => {
      console.warn(
        `Deleting existing Coder API token ${tokenId} (${tokenName})`,
      );
      const deleted = await curlJsonInPod({
        kubeconfigPath,
        namespace,
        podName: targetPodName,
        containerName,
        method: 'DELETE',
        url: `${baseUrl}/api/v2/users/me/keys/${tokenId}`,
        sessionToken,
      });
      if (deleted.statusCode !== 204 && deleted.statusCode !== 200) {
        throw new Error(
          `failed to delete token ${tokenId} (${deleted.statusCode}): ${deleted.body}`,
        );
      }
    };

    const findTokensByName = async (): Promise<CoderTokenInfo[]> => {
      const tokensById = new Map<string, CoderTokenInfo>();

      const byName = await curlJsonInPod({
        kubeconfigPath,
        namespace,
        podName: targetPodName,
        containerName,
        method: 'GET',
        url: `${baseUrl}/api/v2/users/me/keys/tokens/${encodeURIComponent(tokenName)}`,
        sessionToken,
      });
      if (byName.statusCode === 200) {
        const token = JSON.parse(byName.body) as CoderTokenInfo;
        if (token.id?.trim()) {
          tokensById.set(token.id.trim(), token);
        }
      } else if (byName.statusCode !== 404) {
        throw new Error(
          `failed to get token by name (${byName.statusCode}): ${byName.body}`,
        );
      }

      const listTokens = await curlJsonInPod({
        kubeconfigPath,
        namespace,
        podName: targetPodName,
        containerName,
        method: 'GET',
        url: `${baseUrl}/api/v2/users/me/keys/tokens?include_expired=true`,
        sessionToken,
      });
      if (listTokens.statusCode !== 200) {
        throw new Error(
          `failed to list tokens (${listTokens.statusCode}): ${listTokens.body}`,
        );
      }

      const existingTokens = JSON.parse(listTokens.body) as CoderTokenInfo[];
      for (const token of Array.isArray(existingTokens) ? existingTokens : []) {
        if (token.token_name !== tokenName || !token.id?.trim()) {
          continue;
        }
        tokensById.set(token.id.trim(), token);
      }

      return [...tokensById.values()];
    };

    const deleteExistingTokensByName = async (): Promise<void> => {
      for (const token of await findTokensByName()) {
        await deleteTokenById(token.id);
      }
    };

    const createNamedToken = async (): Promise<{
      statusCode: number;
      body: string;
    }> =>
      curlJsonInPod({
        kubeconfigPath,
        namespace,
        podName: targetPodName,
        containerName,
        method: 'POST',
        url: `${baseUrl}/api/v2/users/me/keys/tokens`,
        sessionToken,
        body: {
          token_name: tokenName,
          lifetime: hoursToNanoseconds(tokenLifetimeHours),
          scope: 'all',
        },
      });

    await deleteExistingTokensByName();

    let created = await createNamedToken();
    if (created.statusCode === 409) {
      console.warn(
        `Coder API token ${tokenName} still exists after delete; retrying`,
      );
      await deleteExistingTokensByName();
      created = await createNamedToken();
    }
    if (created.statusCode !== 201 && created.statusCode !== 200) {
      throw new Error(
        `failed to create API token (${created.statusCode}): ${created.body}`,
      );
    }

    const createdBody = JSON.parse(created.body) as CoderCreateTokenResponse;
    const token = createdBody.key?.trim();
    if (!token) {
      throw new Error('create token response did not include key');
    }

    let tokenId = createdBody.id?.trim();
    if (!tokenId) {
      const listedAgain = await curlJsonInPod({
        kubeconfigPath,
        namespace,
        podName: targetPodName,
        containerName,
        method: 'GET',
        url: `${baseUrl}/api/v2/users/me/keys/tokens/${encodeURIComponent(tokenName)}`,
        sessionToken,
      });
      if (listedAgain.statusCode !== 200) {
        throw new Error(
          `failed to resolve created token id (${listedAgain.statusCode}): ${listedAgain.body}`,
        );
      }
      tokenId = (JSON.parse(listedAgain.body) as CoderTokenInfo).id?.trim();
    }
    if (!tokenId) {
      throw new Error('created token id could not be resolved');
    }

    return { token, tokenId, organizationId };
  } finally {
    cleanup();
  }
}

async function runAdminApiTokenScript(): Promise<void> {
  const rawArgs = process.env.ADMIN_API_TOKEN_ARGS;
  if (!rawArgs) {
    throw new Error('ADMIN_API_TOKEN_ARGS environment variable is required');
  }

  const args = JSON.parse(rawArgs) as ResolveAdminApiTokenV1Args;
  const result = await resolveAdminApiTokenV1(args);
  process.stdout.write(JSON.stringify(result));
}

if (require.main === module) {
  void runAdminApiTokenScript().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
