import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
import dedent from 'dedent';
import { VirtualServiceV1 } from '../../resources/k8s/crd/istio/virtual-service.v1.res';
import { VaultAuthV1 } from '../../resources/k8s/crd/vso/vault-auth.v1.res';
import { VaultStaticSecretV1 } from '../../resources/k8s/crd/vso/vault-static-secret.v1.res';
import { kvV2UiBrowsePolicy } from '../vault/kv-v2-ui-browse.policy';

const ATMOZ_SFTP_IMAGE =
  'atmoz/sftp:alpine@sha256:a6cb3eb29202ca7f57e73bb7e527286e66e0e822fff65609207c7e0ef2d135a3';

const USER_ISSUE_TTL = '24h';
const HOST_ISSUE_TTL = '240h';
const USER_ISSUE_TTL_SECONDS = '86400';
const HOST_ISSUE_TTL_SECONDS = '864000';
const USER_ROTATE_CRON = '0 3 1 1,4,7,10 *';
const RECONCILE_CRON = '0 3 * * *';
const CRON_TIMEZONE = 'Asia/Seoul';
const VAULT_JOB_IMAGE = 'hashicorp/vault:2.0.3';
const USER_KEY_OVERLAP = '7 days';

export const SFTP_ISSUER_GROUP_NAMES = [
  'System User',
  'System Manager',
] as const;

export type SftpIssuerGroupName = (typeof SFTP_ISSUER_GROUP_NAMES)[number];

const isSftpIssuerGroupName = (name: string): name is SftpIssuerGroupName =>
  (SFTP_ISSUER_GROUP_NAMES as readonly string[]).includes(name);

interface SftpV3ArgsShape {
  username: string;
  namespace: string;
  targetLabels: { [key: string]: string };
  uid: number;
  gid: number;
  volumeMounts: { pvcVolumeName: string; homeDirName: string }[];
  directGateway: {
    gatewayPath: string;
    port: number;
  };
  hostPrincipals: string[];
  issuerGroupName: SftpIssuerGroupName;
  issuerIdentityGroupId: string;
  userCaMount: string;
  hostCaMount: string;
  kvMount: string;
  slackWebhookUrl: string;
  vaultConnectionRef: string;
  kubernetesAuthMountPath: string;
  vault: {
    address: string;
    tlsServerName: string;
    ca: {
      namespace: string;
      secretName: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
    vault: vault.Provider;
  };
}

export type SftpV3Args = utils.types.DeepPulumiInput<SftpV3ArgsShape>;

const buildSshdConfig = () =>
  dedent`
    Port 22
    Protocol 2
    HostKey /etc/ssh/host-issued/ssh_host_ed25519_key
    PubkeyAuthentication yes
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    ChallengeResponseAuthentication no
    UsePAM no
    HostKeyAlgorithms ssh-ed25519
    PubkeyAcceptedAlgorithms ssh-ed25519
    Subsystem sftp internal-sftp
    ForceCommand internal-sftp
    ChrootDirectory %h
    PermitTunnel no
    AllowAgentForwarding no
    AllowTcpForwarding no
    X11Forwarding no
    PrintMotd no
  `;

export const SftpV3Component = utils.functions.defineComponent(
  'adapter:sftp:v3',
  (
    args: SftpV3Args,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const k8sOpts = {
      ...opts,
      provider: args.providers.kubernetes,
    };
    const vaultOpts = {
      ...opts,
      provider: args.providers.vault,
    };

    const instanceSlug = utils.functions.kebabCase(resourceName);
    const userRoleName = `${instanceSlug}-user`;
    const hostRoleName = `${instanceSlug}-host`;
    const hostKvPath = pulumi.interpolate`sftp/${args.namespace}/${instanceSlug}/host`;
    const userKvPath = pulumi.interpolate`sftp/${args.namespace}/${instanceSlug}/user`;
    const hostK8sSecretName = utils.functions.kebabCase(
      `${resourceName}-sftpHost`,
    );
    const userK8sSecretName = utils.functions.kebabCase(
      `${resourceName}-sftpUser`,
    );
    const configMapName = utils.functions.kebabCase(
      `${resourceName}-sftpConfigMap`,
    );
    const serviceName = utils.functions.kebabCase(
      `${resourceName}-sftpService`,
    );
    const issuerSaName = utils.functions.kebabCase(
      `${resourceName}-sftpIssuer`,
    );
    const vsoAuthName = utils.functions.kebabCase(
      `${resourceName}-sftpVaultAuth`,
    );
    const vsoAuthRoleName = `${instanceSlug}-sftp-vso`;
    const issuerK8sAuthRoleName = `${instanceSlug}-sftp-issuer`;
    const userKvReadPolicyName = `${instanceSlug}-sftp-user-kv-read`;
    const issuerPolicyName = `${instanceSlug}-sftp-issuer`;
    const slackSecretName = utils.functions.kebabCase(
      `${resourceName}-sftpSlackWebhook`,
    );

    const homeDirNames = pulumi
      .output(args.volumeMounts)
      .apply(resolvedVolumeMounts =>
        resolvedVolumeMounts
          .map(eachVolumeMount => eachVolumeMount.homeDirName)
          .join(','),
      );

    pulumi.output(args.issuerGroupName).apply(groupName => {
      if (!isSftpIssuerGroupName(groupName)) {
        throw new Error(
          `${resourceName}: issuerGroupName must be System User or System Manager, got ${JSON.stringify(groupName)}`,
        );
      }
      return groupName;
    });

    const allowedDomains = pulumi
      .output(args.hostPrincipals)
      .apply(principals => {
        if (principals.length === 0) {
          throw new Error(`${resourceName}: hostPrincipals must not be empty`);
        }
        return principals.join(',');
      });

    new vault.ssh.SecretBackendRole(
      `${resourceName}-userSshRole`,
      {
        backend: args.userCaMount,
        name: userRoleName,
        keyType: 'ca',
        allowUserCertificates: true,
        allowHostCertificates: false,
        defaultUser: args.username,
        allowedUsers: args.username,
        ttl: USER_ISSUE_TTL_SECONDS,
        maxTtl: USER_ISSUE_TTL_SECONDS,
      },
      vaultOpts,
    );

    const hostSshRole = new vault.ssh.SecretBackendRole(
      `${resourceName}-hostSshRole`,
      {
        backend: args.hostCaMount,
        name: hostRoleName,
        keyType: 'ca',
        allowUserCertificates: false,
        allowHostCertificates: true,
        allowedDomains,
        allowBareDomains: true,
        ttl: HOST_ISSUE_TTL_SECONDS,
        maxTtl: HOST_ISSUE_TTL_SECONDS,
      },
      vaultOpts,
    );

    const userKvReadPolicy = new vault.Policy(
      `${resourceName}-userKvReadPolicy`,
      {
        name: userKvReadPolicyName,
        policy: pulumi.all([args.kvMount, userKvPath]).apply(
          ([kvMount, secretPath]) =>
            kvV2UiBrowsePolicy({
              kvMount,
              pathSegments: secretPath.split('/'),
              readSecretPaths: [secretPath],
            }),
        ),
      },
      vaultOpts,
    );

    new vault.identity.GroupPolicies(
      `${resourceName}-issuerGroupPolicies`,
      {
        groupId: args.issuerIdentityGroupId,
        exclusive: false,
        policies: [userKvReadPolicy.name],
      },
      {
        ...vaultOpts,
        dependsOn: [userKvReadPolicy],
      },
    );

    const hostKv = new vault.kv.SecretV2(
      `${resourceName}-hostKvPlaceholder`,
      {
        mount: args.kvMount,
        name: hostKvPath,
        dataJson: JSON.stringify({
          private_key: '',
          public_key: '',
        }),
        deleteAllVersions: true,
      },
      vaultOpts,
    );

    const userKv = new vault.kv.SecretV2(
      `${resourceName}-userKvPlaceholder`,
      {
        mount: args.kvMount,
        name: userKvPath,
        dataJson: JSON.stringify({
          current_private: '',
          current_public: '',
          previous_private: '',
          previous_public: '',
          previous_expires_at: '',
          slack_d1_sent: 'true',
          authorized_keys: '',
        }),
        deleteAllVersions: true,
      },
      vaultOpts,
    );

    const issuerPolicy = new vault.Policy(
      `${resourceName}-issuerPolicy`,
      {
        name: issuerPolicyName,
        policy: pulumi
          .all([
            args.userCaMount,
            args.hostCaMount,
            args.kvMount,
            hostKvPath,
            userKvPath,
            userRoleName,
            hostRoleName,
          ])
          .apply(
            ([
              userCaMount,
              hostCaMount,
              kvMount,
              hostPath,
              userPath,
              userRole,
              hostRole,
            ]) =>
              dedent`
              path "${userCaMount}/issue/${userRole}" {
                capabilities = ["create", "update"]
              }
              path "${hostCaMount}/issue/${hostRole}" {
                capabilities = ["create", "update"]
              }
              path "${kvMount}/data/${hostPath}" {
                capabilities = ["create", "update", "read"]
              }
              path "${kvMount}/metadata/${hostPath}" {
                capabilities = ["create", "update", "read"]
              }
              path "${kvMount}/data/${userPath}" {
                capabilities = ["create", "update", "read"]
              }
              path "${kvMount}/metadata/${userPath}" {
                capabilities = ["create", "update", "read"]
              }
            `,
          ),
      },
      vaultOpts,
    );

    const issuerServiceAccount = new kubernetes.core.v1.ServiceAccount(
      `${resourceName}-issuerServiceAccount`,
      {
        metadata: {
          name: issuerSaName,
          namespace: args.namespace,
        },
      },
      k8sOpts,
    );

    const issuerK8sAuthRole = new vault.kubernetes.AuthBackendRole(
      `${resourceName}-issuerK8sAuthRole`,
      {
        backend: args.kubernetesAuthMountPath,
        roleName: issuerK8sAuthRoleName,
        boundServiceAccountNames: [issuerSaName],
        boundServiceAccountNamespaces: [args.namespace],
        tokenPolicies: [issuerPolicy.name],
        tokenTtl: 600,
      },
      {
        ...vaultOpts,
        dependsOn: [issuerPolicy, issuerServiceAccount],
      },
    );

    const vaultCaSource = kubernetes.core.v1.Secret.get(
      `${resourceName}-vaultCaSource`,
      pulumi.interpolate`${args.vault.ca.namespace}/${args.vault.ca.secretName}`,
      k8sOpts,
    );

    const vaultCaSecretName = utils.functions.kebabCase(
      `${resourceName}-vaultCa`,
    );
    const vaultCaSecret = new kubernetes.core.v1.Secret(
      `${resourceName}-vaultCaSecret`,
      {
        metadata: {
          name: vaultCaSecretName,
          namespace: args.namespace,
        },
        data: {
          'ca.crt': vaultCaSource.data.apply(data => {
            const secretData = data ?? {};
            return secretData['ca.crt'] ?? secretData['tls.crt'] ?? '';
          }),
        },
      },
      {
        ...k8sOpts,
        dependsOn: [vaultCaSource],
      },
    );

    const slackWebhookSecret = new kubernetes.core.v1.Secret(
      `${resourceName}-slackWebhookSecret`,
      {
        metadata: {
          name: slackSecretName,
          namespace: args.namespace,
        },
        stringData: {
          url: args.slackWebhookUrl,
        },
      },
      k8sOpts,
    );

    const jobScript = pulumi
      .all([
        args.vault.address,
        args.kubernetesAuthMountPath,
        issuerK8sAuthRoleName,
        args.userCaMount,
        args.hostCaMount,
        userRoleName,
        hostRoleName,
        allowedDomains,
        args.username,
        args.kvMount,
        hostKvPath,
        userKvPath,
        args.namespace,
        resourceName,
      ])
      .apply(
        ([
          vaultAddress,
          k8sMount,
          k8sRole,
          userCaMount,
          hostCaMount,
          userRole,
          hostRole,
          principals,
          username,
          kvMount,
          hostPath,
          userPath,
          namespaceName,
          adapterName,
        ]) =>
          dedent`
            set -eu
            export VAULT_ADDR=${JSON.stringify(vaultAddress)}
            export VAULT_CACERT=/vault/ca/ca.crt
            apk add --no-cache jq curl coreutils openssh-keygen >/dev/null
            VAULT_TOKEN="$(vault write -field=token "auth/${k8sMount}/login" \
              role="${k8sRole}" \
              jwt="$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)")"
            export VAULT_TOKEN
            USER_KV="${kvMount}/${userPath}"
            HOST_KV="${kvMount}/${hostPath}"
            SLACK_URL="$(cat /slack/url)"
            kv_blank() { [ -z "$1" ] || [ "$1" = "null" ]; }
            pub_from_priv() {
              umask 077
              tmp="$(mktemp)"
              printf '%s\n' "$1" > "$tmp"
              ssh-keygen -y -f "$tmp"
              rm -f "$tmp"
            }
            slack_post() {
              curl -sS -X POST -H 'Content-type: application/json' \
                --data "$(jq -n --arg text "$1" '{text:$text}')" \
                "$SLACK_URL" >/dev/null || true
            }
            issue_user() {
              vault write -format=json "${userCaMount}/issue/${userRole}" \
                valid_principals="${username}" \
                key_type=ed25519 \
                ttl="${USER_ISSUE_TTL}"
            }
            put_user() {
              vault kv put "$USER_KV" \
                current_private="$1" \
                current_public="$2" \
                previous_private="$3" \
                previous_public="$4" \
                previous_expires_at="$5" \
                slack_d1_sent="$6" \
                authorized_keys="$7"
            }
            case "$SFTP_JOB_MODE" in
              bootstrap)
                HOST_ISSUE="$(vault write -format=json "${hostCaMount}/issue/${hostRole}" \
                  cert_type=host \
                  key_type=ed25519 \
                  valid_principals="${principals}" \
                  ttl="${HOST_ISSUE_TTL}")"
                HOST_PRIV="$(echo "$HOST_ISSUE" | jq -r .data.private_key)"
                vault kv put "$HOST_KV" \
                  private_key="$HOST_PRIV" \
                  public_key="$(pub_from_priv "$HOST_PRIV")"
                USER_ISSUE="$(issue_user)"
                CUR_PRIV="$(echo "$USER_ISSUE" | jq -r .data.private_key)"
                CUR_PUB="$(pub_from_priv "$CUR_PRIV")"
                put_user "$CUR_PRIV" "$CUR_PUB" "" "" "" "true" "$CUR_PUB"
                ;;
              rotate)
                OLD="$(vault kv get -format=json "$USER_KV")"
                OLD_PRIV="$(echo "$OLD" | jq -r '.data.data.current_private // empty')"
                OLD_PUB="$(echo "$OLD" | jq -r '.data.data.current_public // empty')"
                kv_blank "$OLD_PUB" && ! kv_blank "$OLD_PRIV" && OLD_PUB="$(pub_from_priv "$OLD_PRIV")"
                USER_ISSUE="$(issue_user)"
                CUR_PRIV="$(echo "$USER_ISSUE" | jq -r .data.private_key)"
                CUR_PUB="$(pub_from_priv "$CUR_PRIV")"
                EXPIRES="$(date -u -d '+${USER_KEY_OVERLAP}' +%Y-%m-%dT%H:%M:%SZ)"
                AUTH="$CUR_PUB"
                if ! kv_blank "$OLD_PUB"; then
                  AUTH="$(printf '%s\n%s\n' "$CUR_PUB" "$OLD_PUB")"
                fi
                kv_blank "$OLD_PRIV" && OLD_PRIV=""
                kv_blank "$OLD_PUB" && OLD_PUB=""
                put_user "$CUR_PRIV" "$CUR_PUB" "$OLD_PRIV" "$OLD_PUB" "$EXPIRES" "false" "$AUTH"
                slack_post "[sftp-v3] namespace=${namespaceName} adapter=${adapterName}
            유저 SSH 키(Ed25519)가 교체되었습니다.
            Vault 경로: ${kvMount}/data/${userPath} 의 current_private
            RaiDrive에 새 개인키를 넣으세요. 옛 키는 7일 후 차단됩니다."
                ;;
              reconcile)
                DATA="$(vault kv get -format=json "$USER_KV")"
                EXP="$(echo "$DATA" | jq -r '.data.data.previous_expires_at // empty')"
                SENT="$(echo "$DATA" | jq -r '.data.data.slack_d1_sent // empty')"
                CUR_PRIV="$(echo "$DATA" | jq -r '.data.data.current_private // empty')"
                CUR_PUB="$(echo "$DATA" | jq -r '.data.data.current_public // empty')"
                PREV_PRIV="$(echo "$DATA" | jq -r '.data.data.previous_private // empty')"
                PREV_PUB="$(echo "$DATA" | jq -r '.data.data.previous_public // empty')"
                kv_blank "$SENT" && SENT="true"
                kv_blank "$EXP" && EXP=""
                kv_blank "$PREV_PRIV" && PREV_PRIV=""
                kv_blank "$PREV_PUB" && PREV_PUB=""
                if kv_blank "$CUR_PUB" && ! kv_blank "$CUR_PRIV"; then
                  CUR_PUB="$(pub_from_priv "$CUR_PRIV")"
                  AUTH="$CUR_PUB"
                  if [ -n "$PREV_PUB" ]; then
                    AUTH="$(printf '%s\n%s\n' "$CUR_PUB" "$PREV_PUB")"
                  fi
                  put_user "$CUR_PRIV" "$CUR_PUB" "$PREV_PRIV" "$PREV_PUB" "$EXP" "$SENT" "$AUTH"
                fi
                kv_blank "$EXP" && exit 0
                NOW_EPOCH="$(date -u +%s)"
                EXP_EPOCH="$(date -u -d "$EXP" +%s)"
                if [ "$NOW_EPOCH" -ge "$EXP_EPOCH" ]; then
                  put_user "$CUR_PRIV" "$CUR_PUB" "" "" "" "true" "$CUR_PUB"
                  exit 0
                fi
                REMAIN="$((EXP_EPOCH - NOW_EPOCH))"
                if [ "$REMAIN" -le 86400 ] && [ "$SENT" != "true" ]; then
                  AUTH="$(printf '%s\n%s\n' "$CUR_PUB" "$PREV_PUB")"
                  put_user "$CUR_PRIV" "$CUR_PUB" "$PREV_PRIV" "$PREV_PUB" "$EXP" "true" "$AUTH"
                  slack_post "[sftp-v3] namespace=${namespaceName} adapter=${adapterName}
            옛 유저 SSH 키가 내일 차단됩니다. Vault에서 current_private을 받아 RaiDrive를 갱신하세요."
                fi
                ;;
              *)
                echo "unknown SFTP_JOB_MODE=$SFTP_JOB_MODE" >&2
                exit 1
                ;;
            esac
          `,
      );

    const issuerPodSpec = (
      mode: 'bootstrap' | 'rotate' | 'reconcile',
    ): kubernetes.types.input.core.v1.PodSpec => ({
      serviceAccountName: issuerSaName,
      restartPolicy: 'OnFailure',
      securityContext: {
        runAsUser: 0,
      },
      containers: [
        {
          name: 'sftp-keys',
          image: VAULT_JOB_IMAGE,
          imagePullPolicy: 'IfNotPresent',
          command: ['/bin/sh', '-c'],
          args: [jobScript],
          env: [
            {
              name: 'VAULT_TLS_SERVER_NAME',
              value: args.vault.tlsServerName,
            },
            {
              name: 'SFTP_JOB_MODE',
              value: mode,
            },
          ],
          volumeMounts: [
            {
              name: 'vault-ca',
              mountPath: '/vault/ca',
              readOnly: true,
            },
            {
              name: 'slack-webhook',
              mountPath: '/slack',
              readOnly: true,
            },
          ],
          resources: {
            requests: { cpu: '10m', memory: '32Mi' },
            limits: { cpu: '200m', memory: '128Mi' },
          },
        },
      ],
      volumes: [
        {
          name: 'vault-ca',
          secret: {
            secretName: vaultCaSecretName,
          },
        },
        {
          name: 'slack-webhook',
          secret: {
            secretName: slackSecretName,
          },
        },
      ],
    });

    const bootstrapJob = new kubernetes.batch.v1.Job(
      `${resourceName}-keysBootstrapJob`,
      {
        metadata: {
          name: utils.functions.kebabCase(`${resourceName}-sftpKeysBootstrap`),
          namespace: args.namespace,
        },
        spec: {
          backoffLimit: 6,
          ttlSecondsAfterFinished: 86400,
          template: {
            spec: issuerPodSpec('bootstrap'),
          },
        },
      },
      {
        ...k8sOpts,
        deleteBeforeReplace: true,
        // 부트스트랩 완료 후 스크립트 수정으로 Job을 다시 돌리면 호스트 키가 바뀌어 TOFU가 깨진다.
        ignoreChanges: ['spec'],
        dependsOn: [
          hostSshRole,
          issuerK8sAuthRole,
          hostKv,
          userKv,
          vaultCaSecret,
          slackWebhookSecret,
          issuerServiceAccount,
        ],
      },
    );

    new kubernetes.batch.v1.CronJob(
      `${resourceName}-userKeyRotateCronJob`,
      {
        metadata: {
          name: utils.functions.kebabCase(`${resourceName}-sftpUserRotate`),
          namespace: args.namespace,
        },
        spec: {
          schedule: USER_ROTATE_CRON,
          timeZone: CRON_TIMEZONE,
          concurrencyPolicy: 'Forbid',
          successfulJobsHistoryLimit: 1,
          failedJobsHistoryLimit: 3,
          jobTemplate: {
            spec: {
              backoffLimit: 3,
              template: {
                spec: issuerPodSpec('rotate'),
              },
            },
          },
        },
      },
      {
        ...k8sOpts,
        dependsOn: [bootstrapJob],
      },
    );

    new kubernetes.batch.v1.CronJob(
      `${resourceName}-userKeyReconcileCronJob`,
      {
        metadata: {
          name: utils.functions.kebabCase(`${resourceName}-sftpUserReconcile`),
          namespace: args.namespace,
        },
        spec: {
          schedule: RECONCILE_CRON,
          timeZone: CRON_TIMEZONE,
          concurrencyPolicy: 'Forbid',
          successfulJobsHistoryLimit: 1,
          failedJobsHistoryLimit: 3,
          jobTemplate: {
            spec: {
              backoffLimit: 3,
              template: {
                spec: issuerPodSpec('reconcile'),
              },
            },
          },
        },
      },
      {
        ...k8sOpts,
        dependsOn: [bootstrapJob],
      },
    );

    const vsoServiceAccountName = utils.functions.kebabCase(
      `${resourceName}-sftpVso`,
    );
    const vsoPolicyName = `${instanceSlug}-sftp-vso`;

    const vsoServiceAccount = new kubernetes.core.v1.ServiceAccount(
      `${resourceName}-vsoServiceAccount`,
      {
        metadata: {
          name: vsoServiceAccountName,
          namespace: args.namespace,
        },
      },
      k8sOpts,
    );

    const vsoPolicy = new vault.Policy(
      `${resourceName}-vsoPolicy`,
      {
        name: vsoPolicyName,
        policy: pulumi.all([args.kvMount, hostKvPath, userKvPath]).apply(
          ([kvMount, hostPath, userPath]) =>
            dedent`
              path "${kvMount}/data/${hostPath}" {
                capabilities = ["read"]
              }
              path "${kvMount}/metadata/${hostPath}" {
                capabilities = ["read"]
              }
              path "${kvMount}/data/${userPath}" {
                capabilities = ["read"]
              }
              path "${kvMount}/metadata/${userPath}" {
                capabilities = ["read"]
              }
            `,
        ),
      },
      vaultOpts,
    );

    const vsoK8sAuthRole = new vault.kubernetes.AuthBackendRole(
      `${resourceName}-vsoK8sAuthRole`,
      {
        backend: args.kubernetesAuthMountPath,
        roleName: vsoAuthRoleName,
        boundServiceAccountNames: [vsoServiceAccountName],
        boundServiceAccountNamespaces: [args.namespace],
        tokenPolicies: [vsoPolicy.name],
        tokenTtl: 3600,
      },
      {
        ...vaultOpts,
        dependsOn: [vsoPolicy, vsoServiceAccount],
      },
    );

    const vsoVaultAuth = new VaultAuthV1(
      `${resourceName}-vsoVaultAuth`,
      {
        metadata: {
          name: vsoAuthName,
          namespace: args.namespace,
        },
        spec: {
          vaultConnectionRef: args.vaultConnectionRef,
          method: 'kubernetes',
          mount: args.kubernetesAuthMountPath,
          kubernetes: {
            role: vsoAuthRoleName,
            serviceAccount: vsoServiceAccountName,
          },
        },
      },
      {
        ...k8sOpts,
        dependsOn: [vsoK8sAuthRole, vsoServiceAccount],
      },
    );

    new VaultStaticSecretV1(
      `${resourceName}-hostVaultStaticSecret`,
      {
        metadata: {
          name: hostK8sSecretName,
          namespace: args.namespace,
        },
        spec: {
          vaultAuthRef: vsoAuthName,
          mount: args.kvMount,
          type: 'kv-v2',
          path: hostKvPath,
          refreshAfter: '1m',
          destination: {
            name: hostK8sSecretName,
            create: true,
            transformation: {
              excludeRaw: true,
            },
          },
        },
      },
      {
        ...k8sOpts,
        dependsOn: [vsoVaultAuth, bootstrapJob],
      },
    );

    const userK8sSecret = new VaultStaticSecretV1(
      `${resourceName}-userVaultStaticSecret`,
      {
        metadata: {
          name: userK8sSecretName,
          namespace: args.namespace,
        },
        spec: {
          vaultAuthRef: vsoAuthName,
          mount: args.kvMount,
          type: 'kv-v2',
          path: userKvPath,
          refreshAfter: '1m',
          destination: {
            name: userK8sSecretName,
            create: true,
            transformation: {
              excludeRaw: true,
              excludes: ['current_private', 'previous_private'],
            },
          },
        },
      },
      {
        ...k8sOpts,
        dependsOn: [vsoVaultAuth, bootstrapJob],
      },
    );

    const sftpConfigMap = new kubernetes.core.v1.ConfigMap(
      `${resourceName}-sftpConfigMap`,
      {
        metadata: {
          name: configMapName,
          namespace: args.namespace,
        },
        data: {
          'users.conf': pulumi
            .all([args.username, args.uid, args.gid, homeDirNames])
            .apply(
              ([username, uid, gid, dirs]) =>
                `${username}::${uid}:${gid}:${dirs}`,
            ),
          'sshd_config': buildSshdConfig(),
        },
      },
      k8sOpts,
    );

    const sftpService = new kubernetes.core.v1.Service(
      `${resourceName}-sftpService`,
      {
        metadata: {
          name: serviceName,
          namespace: args.namespace,
        },
        spec: {
          selector: args.targetLabels,
          ports: [
            {
              port: 22,
              name: 'sftp',
              targetPort: 22,
            },
          ],
        },
      },
      k8sOpts,
    );

    new VirtualServiceV1(
      `${resourceName}-sftpVirtualService`,
      {
        metadata: {
          name: utils.functions.kebabCase(`${resourceName}-sftpVirtualService`),
          namespace: args.namespace,
        },
        spec: {
          hosts: ['*'],
          gateways: [args.directGateway.gatewayPath],
          tcp: [
            {
              match: [
                {
                  port: args.directGateway.port,
                },
              ],
              route: [
                {
                  destination: {
                    host: sftpService.metadata.name,
                    port: {
                      number: sftpService.spec.ports[0].port,
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      {
        ...k8sOpts,
        dependsOn: [sftpService],
      },
    );

    const spec = pulumi
      .all([
        sftpConfigMap.metadata.name,
        hostK8sSecretName,
        userK8sSecretName,
        args.username,
        args.volumeMounts,
      ])
      .apply(
        ([
          resolvedConfigMapName,
          resolvedHostSecretName,
          resolvedUserSecretName,
          resolvedUsername,
          resolvedVolumeMounts,
        ]) => {
          const volumeMounts =
            resolvedVolumeMounts.map<kubernetes.types.input.core.v1.VolumeMount>(
              eachResolvedVolumeMount => ({
                name: eachResolvedVolumeMount.pvcVolumeName,
                mountPath: `/home/${resolvedUsername}/${eachResolvedVolumeMount.homeDirName}`,
              }),
            );

          volumeMounts.push(
            {
              name: resolvedConfigMapName,
              mountPath: '/etc/sftp/users.conf',
              subPath: 'users.conf',
            },
            {
              name: resolvedConfigMapName,
              mountPath: '/etc/ssh/sshd_config',
              subPath: 'sshd_config',
            },
            {
              name: 'sftp-host-issued-src',
              mountPath: '/run/sftp-host-issued-src',
              readOnly: true,
            },
            {
              name: 'sftp-host-issued',
              mountPath: '/etc/ssh/host-issued',
            },
            {
              name: 'sftp-user-keys',
              mountPath: `/home/${resolvedUsername}/.ssh/keys/user_auth_key`,
              subPath: 'authorized_keys',
              readOnly: true,
            },
          );

          const containerSpec: kubernetes.types.input.core.v1.Container = {
            name: 'sftp-sidecar',
            image: ATMOZ_SFTP_IMAGE,
            restartPolicy: 'Always',
            command: ['/bin/sh', '-c'],
            args: [
              dedent`
                set -eu
                src=/run/sftp-host-issued-src
                dst=/etc/ssh/host-issued
                cat "$src/ssh_host_ed25519_key" > "$dst/ssh_host_ed25519_key"
                echo >> "$dst/ssh_host_ed25519_key"
                chmod 600 "$dst/ssh_host_ed25519_key"
                exec /entrypoint
              `,
            ],
            ports: [
              {
                containerPort: 22,
                name: 'sftp',
              },
            ],
            volumeMounts,
            securityContext: {
              capabilities: { add: ['SYS_CHROOT'] },
            },
            resources: {
              requests: {
                cpu: '10m',
                memory: '32Mi',
              },
              limits: {
                cpu: '100m',
                memory: '128Mi',
              },
            },
          };

          const volumeSpecs: kubernetes.types.input.core.v1.Volume[] = [
            {
              name: resolvedConfigMapName,
              configMap: {
                name: resolvedConfigMapName,
              },
            },
            {
              name: 'sftp-host-issued-src',
              secret: {
                secretName: resolvedHostSecretName,
                defaultMode: 0o400,
                items: [
                  {
                    key: 'private_key',
                    path: 'ssh_host_ed25519_key',
                  },
                ],
              },
            },
            {
              name: 'sftp-host-issued',
              emptyDir: {},
            },
            {
              name: 'sftp-user-keys',
              secret: {
                secretName: resolvedUserSecretName,
                defaultMode: 0o444,
                items: [
                  {
                    key: 'authorized_keys',
                    path: 'authorized_keys',
                  },
                ],
              },
            },
          ];

          return {
            containerSpec,
            volumeSpecs,
          };
        },
      );

    return {
      output: pulumi.output({
        spec,
        userSecretName: userK8sSecret.metadata.name,
        hostKvPath,
        userKvPath,
        issuerGroupName: args.issuerGroupName,
        reloaderAnnotation: pulumi.interpolate`secret.reloader.stakater.com/reload: ${userK8sSecretName}`,
      }),
      secret: pulumi.secret({}),
    };
  },
);
