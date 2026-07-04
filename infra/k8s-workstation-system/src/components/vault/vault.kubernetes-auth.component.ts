/**
 * Vault Kubernetes auth mount — 클러스터당 1회.
 *
 * VSO·앱 ServiceAccount가 Vault KV를 읽을 때 사용한다.
 * TokenReview용 SA는 kube-system에 둔다.
 */
import fs from 'fs';
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as vault from '@pulumi/vault';
import * as time from '@pulumiverse/time';
import * as yaml from 'yaml';

interface VaultKubernetesAuthComponentArgsShape {
  kubeconfig: string;
  providers: {
    kubernetes: kubernetes.Provider;
    vault: vault.Provider;
  };
}

export type VaultKubernetesAuthComponentArgs =
  utils.types.DeepPulumiInput<VaultKubernetesAuthComponentArgsShape>;

const kubernetesAuthMountPath = 'kubernetes';
const tokenReviewerNamespace = 'kube-system';
const tokenReviewerServiceAccountName = 'vault-token-reviewer';

const resolveKubeconfigContent = (kubeconfigOrPath: string) => {
  const trimmed = kubeconfigOrPath.trim();
  if (
    trimmed.startsWith('apiVersion:') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('---')
  ) {
    return kubeconfigOrPath;
  }

  if (fs.existsSync(kubeconfigOrPath)) {
    return fs.readFileSync(kubeconfigOrPath, 'utf8');
  }

  throw new Error(
    `kubeconfig not found: path does not exist and content is not inline YAML/JSON (${kubeconfigOrPath})`,
  );
};

const parseKubeClusterFromKubeconfig = (kubeconfigOrPath: string) => {
  const kubeconfigContent = resolveKubeconfigContent(kubeconfigOrPath);
  const config = (
    kubeconfigContent.trim().startsWith('{')
      ? JSON.parse(kubeconfigContent)
      : yaml.parse(kubeconfigContent)
  ) as utils.interfaces.KubeConfig;

  if (!config?.contexts?.length || !config?.clusters?.length) {
    throw new Error('kubeconfig: contexts or clusters missing');
  }

  const contextName = config['current-context'];
  const context = config.contexts.find(item => item.name === contextName)?.context;
  const cluster = config.clusters.find(
    item => item.name === context?.cluster,
  )?.cluster;

  if (!cluster?.server) {
    throw new Error('kubeconfig: cluster server not found');
  }

  const certificateAuthorityData = cluster['certificate-authority-data'];
  if (!certificateAuthorityData) {
    throw new Error('kubeconfig: certificate-authority-data not found');
  }

  return {
    host: cluster.server,
    caCert: Buffer.from(certificateAuthorityData, 'base64').toString('utf8'),
  };
};

export const VaultKubernetesAuthComponent = utils.functions.defineComponent(
  'vaultKubernetesAuth',
  (
    args: VaultKubernetesAuthComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const vaultProviderOpts = { ...opts, provider: args.providers.vault };
    const kubeCluster = pulumi
      .output(args.kubeconfig)
      .apply(parseKubeClusterFromKubeconfig);

    const kubernetesAuthBackend = new vault.AuthBackend(
      `${resourceName}-kubernetesAuthBackend`,
      {
        type: 'kubernetes',
        path: kubernetesAuthMountPath,
        description: 'Kubernetes service account authentication for VSO',
      },
      vaultProviderOpts,
    );

    const tokenReviewerServiceAccount = new kubernetes.core.v1.ServiceAccount(
      `${resourceName}-tokenReviewerServiceAccount`,
      {
        metadata: {
          name: tokenReviewerServiceAccountName,
          namespace: tokenReviewerNamespace,
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
      },
    );

    const tokenReviewerClusterRoleBinding =
      new kubernetes.rbac.v1.ClusterRoleBinding(
        `${resourceName}-tokenReviewerClusterRoleBinding`,
        {
          metadata: {
            name: 'vault-token-reviewer',
          },
          roleRef: {
            apiGroup: 'rbac.authorization.k8s.io',
            kind: 'ClusterRole',
            name: 'system:auth-delegator',
          },
          subjects: [
            {
              kind: 'ServiceAccount',
              name: tokenReviewerServiceAccount.metadata.name,
              namespace: tokenReviewerNamespace,
            },
          ],
        },
        {
          ...opts,
          provider: args.providers.kubernetes,
          dependsOn: [tokenReviewerServiceAccount],
        },
      );

    const tokenReviewerSecret = new kubernetes.core.v1.Secret(
      `${resourceName}-tokenReviewerSecret`,
      {
        metadata: {
          name: 'vault-token-reviewer',
          namespace: tokenReviewerNamespace,
          annotations: {
            'kubernetes.io/service-account.name':
              tokenReviewerServiceAccountName,
          },
        },
        type: 'kubernetes.io/service-account-token',
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [
          tokenReviewerServiceAccount,
          tokenReviewerClusterRoleBinding,
        ],
      },
    );

    const tokenReviewerSecretReady = new time.Sleep(
      `${resourceName}-tokenReviewerSecretReady`,
      {
        createDuration: '15s',
      },
      {
        ...opts,
        dependsOn: [tokenReviewerSecret],
      },
    );

    const tokenReviewerJwt = tokenReviewerSecret.data.apply(data => {
      const token = data?.token;
      if (!token) {
        throw new Error(
          'vault-token-reviewer secret token not populated yet',
        );
      }
      return Buffer.from(token, 'base64').toString('utf8');
    });

    new vault.kubernetes.AuthBackendConfig(
      `${resourceName}-kubernetesAuthBackendConfig`,
      {
        backend: kubernetesAuthBackend.path,
        kubernetesHost: kubeCluster.apply(cluster => cluster.host),
        kubernetesCaCert: kubeCluster.apply(cluster => cluster.caCert),
        tokenReviewerJwt,
        disableIssValidation: true,
      },
      {
        ...vaultProviderOpts,
        dependsOn: [
          kubernetesAuthBackend,
          tokenReviewerSecretReady,
        ],
      },
    );

    return {
      output: pulumi.output({
        mountPath: kubernetesAuthBackend.path,
      }),
      secret: pulumi.secret({}),
    };
  },
);
