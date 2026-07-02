/**
 * Vault bootstrap token (v1)
 *
 * Pulumi apply 시점에 Vault Pod에 exec하여 IaC용 orphan admin 토큰을 발급·갱신합니다.
 * 토큰은 AES-256-GCM으로 암호화해 각 Pod PVC(`/vault/data/bootstrap-token.enc`)에 저장하고,
 * 평문 토큰은 Pulumi Output으로 반환합니다. (구 CDKTF DataExternal + kubectl exec 대체)
 */
import * as crypto from 'crypto';
import * as utils from '@common/utils/src';
import * as k8s from '@kubernetes/client-node';
import * as pulumi from '@pulumi/pulumi';
import dedent from 'dedent';
import {
  execInPod,
  loadKubeConfig,
} from '../../kubernetes/exec-in-pod.function';

interface GetBootstrapTokenV1ArgsShape {
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

export type GetBootstrapTokenV1Args =
  utils.types.DeepPulumiInput<GetBootstrapTokenV1ArgsShape>;

type GetBootstrapTokenV1Result = {
  token: string;
};

// --- 암호화 (iv + authTag + ciphertext → base64 한 줄) ---

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function aesKey(staticKey: string): Buffer {
  if (!staticKey.trim()) {
    throw new Error('staticKey must not be empty');
  }
  return crypto.createHash('sha256').update(staticKey, 'utf8').digest();
}

export function encrypt(plaintext: string, staticKey: string): string {
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

export function decrypt(blobBase64: string, staticKey: string): string {
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

// --- Vault CLI 응답 파싱 ---

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

/** exec 스크립트가 enc 파일 부재를 나타낼 때 stdout에 쓰는 마커 */
const BOOTSTRAP_TOKEN_FILE_MISSING = '__VAULT_BOOTSTRAP_TOKEN_FILE_MISSING__';
const BOOTSTRAP_TOKEN_FILE_EXISTS = '__VAULT_BOOTSTRAP_TOKEN_FILE_EXISTS__';
const BOOTSTRAP_TOKEN_FILE_ABSENT = '__VAULT_BOOTSTRAP_TOKEN_FILE_ABSENT__';

const VAULT_POD_RUNNING_TIMEOUT_MS = 5 * 60 * 1000;
const VAULT_POD_POLL_INTERVAL_MS = 5000;

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

// --- Pod 내 vault CLI용 shell 스크립트 조각 ---

function vaultExecEnvScript(vaultAddr: string, vaultCacert: string): string {
  return dedent`
    export VAULT_ADDR=${vaultAddr}
    export VAULT_CACERT=${vaultCacert}
  `;
}

/** API가 응답할 때까지 대기 (미초기화 시 vault status exit 2도 “준비됨”으로 처리) */
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

/** exit 0=initialized, exit 2=not initialized, 그 외=오류(TLS 등) */
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
      echo '${BOOTSTRAP_TOKEN_FILE_EXISTS}'
    else
      echo '${BOOTSTRAP_TOKEN_FILE_ABSENT}'
    fi
  `;
}

export function getBootstrapTokenV1(
  args: GetBootstrapTokenV1Args,
): pulumi.Output<GetBootstrapTokenV1Result> {
  return pulumi.all([args]).apply(async ([resolvedArgs]) => {
    if (pulumi.runtime.isDryRun()) {
      return {
        token: 'sample-bootstrap-token-for-dry-run',
      };
    }

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
    } = resolvedArgs;

    const kc = loadKubeConfig(kubeconfig);
    const k8sApiClient = kc.makeApiClient(k8s.CoreV1Api);

    // --- 1. Vault Pod Running 대기 (최대 5분, 5초 간격) ---
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
          await pulumi.log.warn(
            `Waiting for Vault Pod to exist in namespace ${namespace}`,
          );
        } else {
          const notRunningVaultPodCandidates = vaultPodCandidates.filter(
            pod => pod.status?.phase !== 'Running',
          );
          if (notRunningVaultPodCandidates.length === 0) {
            return vaultPodCandidates;
          }
          await pulumi.log.warn(
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

    // Vault CLI는 primary Pod(vaultPods[0])에서 실행. API 주소는 Service DNS 사용.
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

    /** Raft는 enc 파일을 복제하지 않으므로 replica마다 PVC에 직접 기록 */
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

    /** scale-up 등으로 enc 파일이 없는 replica에 primary와 동일한 blob만 복사 (토큰 갱신 없음) */
    const syncMissingBootstrapTokenFiles = async (
      encryptedToken: string,
    ) => {
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

          await pulumi.log.info(
            `Syncing bootstrap token file to ${writePodName} (scale-up / missing file)`,
          );
          await writeEncryptedBootstrapToken(writePodName, encryptedToken);
        }),
      );
    };

    // --- 2. Vault API 준비 및 init 여부 확인 ---
    await execOnVault(waitForVaultApiScript(vaultAddr, vaultCacert));

    const { stdout: initStatusStdout } = await execOnVault(
      vaultInitStatusScript(vaultAddr, vaultCacert),
    );
    const isVaultInitialized = initStatusStdout.trim() === 'true';

    let previousToken = '';
    let isExpired = true;
    /** initialized 분기에서 primary Pod enc blob — 만료되지 않았을 때 replica sync에 재사용 */
    let encryptedBootstrapToken = '';

    // --- 3. 기존 토큰 로드 또는 최초 init ---
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

      // vault token lookup으로 creation_time 기준 만료 판단 (lookup 실패 시 갱신)
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
      // 미초기화: operator init → root_token 확보 후 orphan 토큰으로 교체 예정
      const { stdout: initJsonStdout } = await execOnVault(dedent`
        ${vaultExecEnvScript(vaultAddr, vaultCacert)}
        vault operator init -format=json
      `);
      previousToken = parseOperatorInitResponse(initJsonStdout);
      isExpired = true;
      await pulumi.log.info('Vault initialized with root token for bootstrap');
    }

    // --- 4. 만료 시 orphan 토큰 발급·저장 / 유효 시 replica 누락 파일만 sync ---
    if (isExpired) {
      if (isVaultInitialized) {
        await pulumi.log.info(
          `Vault bootstrap token expired or invalid (rotation interval: ${expirationMinutes}m); issuing new orphan token`,
        );
      }

      const { stdout: newTokenStdout } = await execOnVault(dedent`
        ${vaultExecEnvScript(vaultAddr, vaultCacert)}
        export VAULT_TOKEN='${previousToken}'
        vault token create -format=json -orphan -policy=root
        vault token revoke '${previousToken}' >/dev/null 2>&1 || true
      `);
      const newToken = parseTokenCreateResponse(newTokenStdout);
      const encryptedNewToken = encrypt(newToken, bootstrapTokenEncryptionKey);

      // 갱신 시 모든 replica에 새 enc blob 기록 (기존 파일이 있어도 덮어씀)
      await writeEncryptedBootstrapToken(targetPodName, encryptedNewToken);
      const otherVaultPods = vaultPods.filter(
        pod => pod.metadata?.name !== targetPodName,
      );
      await Promise.all(
        otherVaultPods.map(pod => {
          const writePodName = pod.metadata?.name;
          if (!writePodName) {
            throw new Error(
              'Vault pod name is missing while syncing bootstrap token',
            );
          }
          return writeEncryptedBootstrapToken(writePodName, encryptedNewToken);
        }),
      );

      return {
        token: newToken,
      };
    }

    // 토큰은 유효 — scale-up 등으로 enc 파일이 없는 replica에만 primary blob 복사
    await syncMissingBootstrapTokenFiles(encryptedBootstrapToken);

    return {
      token: previousToken,
    };
  });
}
