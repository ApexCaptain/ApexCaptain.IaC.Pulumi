/**
 * Vault bootstrap token resolve script (v1)
 *
 * Pulumi Command subprocess entry. Pod exec로 orphan root-policy token을 발급·갱신하고 PVC에 enc 저장.
 */
import * as crypto from 'crypto';
import * as utils from '@common/utils/src';
import * as k8s from '@kubernetes/client-node';
import dedent from 'dedent';
import {
  execInPod,
  loadKubeConfig,
} from './exec-in-pod.function';
import type {
  ResolveBootstrapTokenV1Args,
  ResolveBootstrapTokenV1Result,
} from '../src/resources/vault/bootstrap-token.v1.res';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

const BOOTSTRAP_TOKEN_FILE_MISSING = '__VAULT_BOOTSTRAP_TOKEN_FILE_MISSING__';
const BOOTSTRAP_TOKEN_FILE_ABSENT = '__VAULT_BOOTSTRAP_TOKEN_FILE_ABSENT__';

const VAULT_POD_RUNNING_TIMEOUT_MS = 5 * 60 * 1000;
const VAULT_POD_POLL_INTERVAL_MS = 5000;

function aesKey(staticKey: string): Buffer {
  if (!staticKey.trim()) {
    throw new Error('staticKey must not be empty');
  }
  return crypto.createHash('sha256').update(staticKey, 'utf8').digest();
}

function encrypt(plaintext: string, staticKey: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, aesKey(staticKey), iv, {
    authTagLength: TAG_BYTES,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

function decrypt(blobBase64: string, staticKey: string): string {
  const blob = Buffer.from(blobBase64.trim(), 'base64');
  if (blob.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('Encrypted bootstrap token blob is too short');
  }
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = blob.subarray(IV_BYTES + TAG_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, aesKey(staticKey), iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

type VaultTokenLookupJson = {
  creation_time?: number;
  data?: { creation_time?: number };
};

type VaultTokenCreateJson = {
  auth?: { client_token?: string };
};

type VaultOperatorInitJson = {
  root_token?: string;
};

function parseCreationTimeEpochSeconds(stdout: string): number | undefined {
  const lookup = JSON.parse(stdout.trim()) as VaultTokenLookupJson;
  const creationTime = lookup.creation_time ?? lookup.data?.creation_time;
  if (creationTime == null || Number.isNaN(creationTime)) {
    return undefined;
  }
  return creationTime;
}

function parseTokenCreateResponse(stdout: string): string {
  const response = JSON.parse(stdout.trim()) as VaultTokenCreateJson;
  const token = response.auth?.client_token?.trim();
  if (!token) {
    throw new Error('vault token create did not return auth.client_token');
  }
  return token;
}

function parseOperatorInitResponse(stdout: string): string {
  const response = JSON.parse(stdout.trim()) as VaultOperatorInitJson;
  const rootToken = response.root_token?.trim();
  if (!rootToken) {
    throw new Error('vault operator init did not return root_token');
  }
  return rootToken;
}

function isTokenExpired(
  creationTimeEpochSeconds: number,
  expirationMinutes: number,
): boolean {
  const expirationTimeMs =
    creationTimeEpochSeconds * 1000 + expirationMinutes * 60 * 1000;
  return Date.now() >= expirationTimeMs;
}

function vaultExecEnvScript(vaultAddr: string, vaultCacert: string): string {
  return dedent`
    export VAULT_ADDR=${vaultAddr}
    export VAULT_CACERT=${vaultCacert}
  `;
}

function waitForVaultApiScript(vaultAddr: string, vaultCacert: string): string {
  return dedent`
    ${vaultExecEnvScript(vaultAddr, vaultCacert)}
    i=0
    while [ "$i" -lt 60 ]; do
      if vault status -format=json >/dev/null 2>&1; then
        break
      else
        code=$?
        if [ "$code" -eq 2 ]; then
          break
        fi
      fi
      i=$((i + 1))
      sleep 2
    done
    if [ "$i" -ge 60 ]; then
      echo "Vault API did not become ready in time" >&2
      exit 1
    fi
  `;
}

function vaultInitStatusScript(vaultAddr: string, vaultCacert: string): string {
  return dedent`
    ${vaultExecEnvScript(vaultAddr, vaultCacert)}
    if vault operator init -status >/dev/null 2>&1; then
      echo true
    else
      code=$?
      if [ "$code" -eq 2 ]; then
        echo false
      else
        exit "$code"
      fi
    fi
  `;
}

function bootstrapTokenFileCheckScript(filePath: string): string {
  return dedent`
    if [ -f '${filePath}' ]; then
      echo present
    else
      echo '${BOOTSTRAP_TOKEN_FILE_ABSENT}'
    fi
  `;
}

export async function resolveBootstrapTokenV1(
  args: ResolveBootstrapTokenV1Args,
): Promise<ResolveBootstrapTokenV1Result> {
  const {
    namespace,
    podName,
    containerName,
    serviceName,
    servicePort,
    kubeconfig,
    tokenDirPath,
    bootstrapTokenEncryptionKey,
    expirationMinutes,
    vaultServerCertificateSecretName,
  } = args;

  const kc = loadKubeConfig(kubeconfig);
  const k8sApiClient = kc.makeApiClient(k8s.CoreV1Api);

  const vaultPods = await (async () => {
    const deadline = Date.now() + VAULT_POD_RUNNING_TIMEOUT_MS;

    while (true) {
      const vaultPodCandidates = (
        await k8sApiClient.listNamespacedPod({
          namespace,
          labelSelector: `app.kubernetes.io/name=${podName}`,
        })
      ).items;

      if (vaultPodCandidates.length === 0) {
        console.warn(`Waiting for Vault Pod to exist in namespace ${namespace}`);
      } else {
        const notRunningVaultPodCandidates = vaultPodCandidates.filter(
          pod => pod.status?.phase !== 'Running',
        );
        if (notRunningVaultPodCandidates.length === 0) {
          return vaultPodCandidates;
        }
        console.warn(
          `Waiting for Vault Pod to be Running: ${notRunningVaultPodCandidates.map(pod => pod.metadata?.name).join(', ')}`,
        );
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Vault Pod did not become Running within ${VAULT_POD_RUNNING_TIMEOUT_MS / 1000}s in namespace ${namespace}`,
        );
      }

      await utils.functions.waitForMs(VAULT_POD_POLL_INTERVAL_MS);
    }
  })();

  const targetPodName = vaultPods[0].metadata?.name;
  if (!targetPodName) {
    throw new Error('Vault pod name is missing');
  }

  const vaultAddr = `https://${serviceName}.${namespace}.svc.cluster.local:${servicePort}`;
  const vaultCacert = `/vault/userconfig/${vaultServerCertificateSecretName}/ca.crt`;
  const encryptedBootstrapTokenFilePath = `${tokenDirPath}/bootstrap-token.enc`;

  const execOnVault = (script: string, stdin?: string) =>
    execInPod({
      kubeconfig,
      namespace,
      podName: targetPodName,
      containerName,
      script,
      stdin,
    });

  const writeEncryptedBootstrapToken = (
    writePodName: string,
    encryptedToken: string,
  ) =>
    execInPod({
      kubeconfig,
      namespace,
      podName: writePodName,
      containerName,
      script: `cat > '${encryptedBootstrapTokenFilePath}'`,
      stdin: encryptedToken,
    });

  const syncMissingBootstrapTokenFiles = async (encryptedToken: string) => {
    const otherVaultPods = vaultPods.filter(
      pod => pod.metadata?.name !== targetPodName,
    );

    await Promise.all(
      otherVaultPods.map(async pod => {
        const writePodName = pod.metadata?.name;
        if (!writePodName) {
          throw new Error(
            'Vault pod name is missing while syncing bootstrap token',
          );
        }

        const { stdout } = await execInPod({
          kubeconfig,
          namespace,
          podName: writePodName,
          containerName,
          script: bootstrapTokenFileCheckScript(
            encryptedBootstrapTokenFilePath,
          ),
        });

        if (stdout.trim() !== BOOTSTRAP_TOKEN_FILE_ABSENT) {
          return;
        }

        console.info(
          `Syncing bootstrap token file to ${writePodName} (scale-up / missing file)`,
        );
        await writeEncryptedBootstrapToken(writePodName, encryptedToken);
      }),
    );
  };

  await execOnVault(waitForVaultApiScript(vaultAddr, vaultCacert));

  const { stdout: initStatusStdout } = await execOnVault(
    vaultInitStatusScript(vaultAddr, vaultCacert),
  );
  const isVaultInitialized = initStatusStdout.trim() === 'true';

  let previousToken = '';
  let isExpired = true;
  let encryptedBootstrapToken = '';

  if (isVaultInitialized) {
    const { stdout: encryptedBootstrapTokenStdout } = await execOnVault(
      dedent`
        if [ ! -f '${encryptedBootstrapTokenFilePath}' ]; then
          echo '${BOOTSTRAP_TOKEN_FILE_MISSING}'
          exit 0
        fi
        cat '${encryptedBootstrapTokenFilePath}'
      `,
    );
    encryptedBootstrapToken = encryptedBootstrapTokenStdout.trim();

    if (encryptedBootstrapToken === BOOTSTRAP_TOKEN_FILE_MISSING) {
      throw new Error(
        `Vault is initialized but bootstrap token file is missing: ${encryptedBootstrapTokenFilePath}. ` +
          'Create an orphan root-policy token manually or re-run bootstrap after resolving storage.',
      );
    }

    try {
      previousToken = decrypt(
        encryptedBootstrapToken,
        bootstrapTokenEncryptionKey,
      );
    } catch (error) {
      throw new Error(
        `Failed to decrypt bootstrap token at ${encryptedBootstrapTokenFilePath}: ${error}`,
      );
    }

    try {
      const { stdout: tokenLookupStdout } = await execOnVault(dedent`
        ${vaultExecEnvScript(vaultAddr, vaultCacert)}
        export VAULT_TOKEN='${previousToken}'
        vault token lookup -format=json
      `);
      const creationTimeEpochSeconds =
        parseCreationTimeEpochSeconds(tokenLookupStdout);
      if (creationTimeEpochSeconds == null) {
        isExpired = true;
      } else {
        isExpired = isTokenExpired(
          creationTimeEpochSeconds,
          expirationMinutes,
        );
      }
    } catch {
      isExpired = true;
    }
  } else {
    const { stdout: initJsonStdout } = await execOnVault(dedent`
      ${vaultExecEnvScript(vaultAddr, vaultCacert)}
      vault operator init -format=json
    `);
    previousToken = parseOperatorInitResponse(initJsonStdout);
    isExpired = true;
    console.info('Vault initialized with root token for bootstrap');
  }

  if (isExpired) {
    if (isVaultInitialized) {
      console.info(
        `Vault bootstrap token expired or invalid (rotation interval: ${expirationMinutes}m); issuing new orphan token`,
      );
    }

    const { stdout: newTokenStdout } = await execOnVault(dedent`
      ${vaultExecEnvScript(vaultAddr, vaultCacert)}
      export VAULT_TOKEN='${previousToken}'
      vault token create -format=json -orphan -policy=root -ttl=0
      vault token revoke '${previousToken}' >/dev/null 2>&1 || true
    `);
    const newToken = parseTokenCreateResponse(newTokenStdout);
    const encryptedNewToken = encrypt(newToken, bootstrapTokenEncryptionKey);

    await writeEncryptedBootstrapToken(targetPodName, encryptedNewToken);
    await Promise.all(
      vaultPods
        .filter(pod => pod.metadata?.name !== targetPodName)
        .map(pod => {
          const writePodName = pod.metadata?.name;
          if (!writePodName) {
            throw new Error(
              'Vault pod name is missing while syncing bootstrap token',
            );
          }
          return writeEncryptedBootstrapToken(writePodName, encryptedNewToken);
        }),
    );

    return { token: newToken };
  }

  await syncMissingBootstrapTokenFiles(encryptedBootstrapToken);

  return { token: previousToken };
}

async function runBootstrapTokenScript(): Promise<void> {
  const rawArgs = process.env.BOOTSTRAP_ARGS;
  if (!rawArgs) {
    throw new Error('BOOTSTRAP_ARGS environment variable is required');
  }

  const args = JSON.parse(rawArgs) as ResolveBootstrapTokenV1Args;
  const result = await resolveBootstrapTokenV1(args);
  process.stdout.write(JSON.stringify(result));
}

if (require.main === module) {
  void runBootstrapTokenScript().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
