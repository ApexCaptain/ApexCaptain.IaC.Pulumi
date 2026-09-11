import dns from 'dns/promises';
import * as pulumiEscSdk from '@pulumi/esc-sdk';
import axios from 'axios';
import * as NexusEsc from '../common/nexus/src/esc';
import * as src from '../src';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `script:syncPulumiEsc: missing required env ${name}. Set DevContainer secrets/env then retry.`,
    );
  }
  return value;
}

async function syncPulumiEsc(): Promise<void> {
  requireEnv('PULUMI_ACCESS_TOKEN');
  requireEnv('PULUMI_APEX_CAPTAIN_ACCOUNT_NAME');
  requireEnv('WORKSTATION_DOMAIN_IPTIME');
  requireEnv('NORD_VPN_APEX_CAPTAIN_ACCESS_TOKEN');

  const accountName = process.env.PULUMI_APEX_CAPTAIN_ACCOUNT_NAME!!;

  const workstationIpV4Address = (
    await dns.lookup(process.env.WORKSTATION_DOMAIN_IPTIME!!)
  ).address;

  const pulumiEscClient = new pulumiEscSdk.EscApi(
    new pulumiEscSdk.Configuration({
      accessToken: process.env.PULUMI_ACCESS_TOKEN!!,
    }),
  );

  await NexusEsc.commonEsc.upsertEsc(
    accountName,
    pulumiEscClient,
    {
      workstationKubeconfig: process.env.KUBE_CONFIG_WORKSTATION_FILE_PATH,
      workstationIptimeDomain: process.env.WORKSTATION_DOMAIN_IPTIME,
      workstationIpV4Address,
      workstationPodsSubnetCidrBlock:
        process.env.WORKSTATION_BOOTSTRAP_KUBE_PODS_SUBNET_CIDR_BLOCK,
      workstationServicesSubnetCidrBlock:
        process.env.WORKSTATION_BOOTSTRAP_KUBE_SERVICE_SUBNET_CIDR_BLOCK,
      workstationLocalPathStorageClassName:
        process.env.WORKSTATION_BOOTSTRAP_LOCAL_PATH_STORAGECLASS_NAME,
      adapter: {
        sftp: {
          userName: process.env.WORKSTATION_SFTP_ADAPTER_USERNAME,
        },
      },
      istioNetwork: {
        meshId: process.env.ISTIO_MESH_ID,
        workstationClusterName: process.env.ISTIO_WORKSTATION_CLUSTER_NAME,
        workstationClusterNetwork:
          process.env.ISTIO_WORKSTATION_CLUSTER_NETWORK,
        workstationDirectGateway: {
          jellyfinSftpName:
            process.env.WORKSTATION_DIRECT_GATEWAY_JELLYFIN_SFTP_NAME,
          jellyfinSftpProtocol:
            process.env.WORKSTATION_DIRECT_GATEWAY_JELLYFIN_SFTP_PROTOCOL,
          jellyfinSftpPort: parseInt(
            process.env.WORKSTATION_DIRECT_GATEWAY_JELLYFIN_SFTP_PORT!!,
          ),
          qbittorrentSftpName:
            process.env.WORKSTATION_DIRECT_GATEWAY_QBITORRENT_SFTP_NAME,
          qbittorrentSftpProtocol:
            process.env.WORKSTATION_DIRECT_GATEWAY_QBITORRENT_SFTP_PROTOCOL,
          qbittorrentSftpPort: parseInt(
            process.env.WORKSTATION_DIRECT_GATEWAY_QBITORRENT_SFTP_PORT!!,
          ),
        },
      },

      nordLynx: {
        privateKey: (
          await axios.get(
            'https://api.nordvpn.com/v1/users/services/credentials',
            {
              auth: {
                username: 'token',
                password: process.env.NORD_VPN_APEX_CAPTAIN_ACCESS_TOKEN!!,
              },
            },
          )
        ).data.nordlynx_private_key as string,
      },
      helmRepositoryUrls: src.constants.helmChartRepositoryUrls,
    },
    {
      prod: {},
      dev: {},
    },
  );

  await NexusEsc.ociEsc.upsertEsc(
    accountName,
    pulumiEscClient,
    {
      auth: 'ApiKey',
      fingerprint: process.env.APEX_CAPTAIN_OCI_FINGERPRINT,
      privateKey: process.env.APEX_CAPTAIN_OCI_PRIVATE_KEY!!.replace(
        /\\n/g,
        '\n',
      ),
      region: process.env.APEX_CAPTAIN_OCI_REGION,
      tenancyOcid: process.env.APEX_CAPTAIN_OCI_TENANCY_OCID,
      userOcid: process.env.APEX_CAPTAIN_OCI_USER_OCID,
    },
    {
      prod: {},
      dev: {},
    },
  );

  await NexusEsc.cloudflareEsc.upsertEsc(
    accountName,
    pulumiEscClient,
    {
      apiToken: process.env.CLOUDFLARE_APEX_CAPTAIN_API_TOKEN,
      email: process.env.CLOUDFLARE_APEX_CAPTAIN_EMAIL,
      zones: {
        ayteneve93com: {
          id: process.env.CLOUDFLARE_APEX_CAPTAIN_AYTENEVE93_COM_ZONE_ID,
        },
        itemguessercom: {
          id: process.env.CLOUDFLARE_APEX_CAPTAIN_ITEMGUESSER_COM_ZONE_ID,
        },
      },
    },
    {
      prod: {},
    },
  );

  await NexusEsc.githubEsc.upsertEsc(
    accountName,
    pulumiEscClient,
    {
      apexCaptain: {
        owner: process.env.GITHUB_OWNER_APEX_CAPTAIN,
        token: process.env.GH_TOKEN,
      },
    },
    {
      prod: {},
      dev: {},
    },
  );

  await NexusEsc.k8sWorkstationSystemEsc.upsertEsc(
    accountName,
    pulumiEscClient,
    {
      vault: {
        bootstrapTokenEncryptionKey:
          process.env.VAULT_BOOTSTRAP_TOKEN_ENCRYPTION_KEY,
      },
      longhorn: {
        nodes: [
          // Node 0
          {
            hostName: process.env.WORKSTATION_BOOTSTRAP_NODE_0_HOSTNAME,
            disks: [
              {
                name: process.env
                  .WORKSTATION_BOOTSTRAP_NODE_0_LONGHORN_DISK_0_NAME,
                path: process.env
                  .WORKSTATION_BOOTSTRAP_NODE_0_LONGHORN_DISK_0_MOUNTPATH,
                tags: [
                  process.env
                    .WORKSTATION_BOOTSTRAP_NODE_0_LONGHORN_DISK_0_DISKTYPE,
                ],
              },
              {
                name: process.env
                  .WORKSTATION_BOOTSTRAP_NODE_0_LONGHORN_DISK_1_NAME,
                path: process.env
                  .WORKSTATION_BOOTSTRAP_NODE_0_LONGHORN_DISK_1_MOUNTPATH,
                tags: [
                  process.env
                    .WORKSTATION_BOOTSTRAP_NODE_0_LONGHORN_DISK_1_DISKTYPE,
                ],
              },
            ],
          },
        ],
      },

      loadbalancer: {
        celium: {
          istioCrossNetworkTlsIp:
            process.env.WORKSTATION_SERVICE_LB_ISTIO_CROSS_NETWORK_TLS,
          ingressGatewayIp: process.env.WORKSTATION_SERVICE_LB_INGRESS,
        },
      },
      authentik: {
        secretKey: process.env.AUTHENTIK_SECRET_KEY,
        bootstrap: {
          token: process.env.AUTHENTIK_BOOTSTRAP_TOKEN,
          email: process.env.AUTHENTIK_BOOTSTRAP_EMAIL,
          password: process.env.AUTHENTIK_BOOTSTRAP_PASSWORD,
        },
        postgresqlPassword: process.env.AUTHENTIK_POSTGRESQL_PASSWORD,
        oauth: {
          google: {
            clientId: process.env.GOOGLE_OAUTH_AUTHENTIK_APP_CLIENT_ID,
            clientSecret: process.env.GOOGLE_OAUTH_AUTHENTIK_APP_CLIENT_SECRET,
          },
        },
      },
      argoCd: {
        gitOpsRepositoryName: process.env.ARGOCD_GITOPS_REPOSITORY_NAME,
        bootstrapPassword: process.env.ARGOCD_BOOTSTRAP_PASSWORD,
        bootstrapPasswordBcrypt: process.env.ARGOCD_BOOTSTRAP_PASSWORD_BCRYPT,
      },
      grafana: {
        adminPassword: process.env.GRAFANA_ADMIN_PASSWORD,
        slackWebhookUrlInfraAlerts: process.env.SLACK_WEBHOOK_URL_INFRA_ALERTS,
      },
    },
    {
      prod: {},
    },
  );

  await NexusEsc.k8sWorkstationAppsEsc.upsertEsc(
    accountName,
    pulumiEscClient,
    {
      slackWebhookUrlVaultAlerts: process.env.SLACK_WEBHOOK_URL_VAULT_ALERTS!!,
    },
    {
      prod: {},
      dev: {},
    },
  );

  await NexusEsc.k8sWorkstationToolsEsc.upsertEsc(
    accountName,
    pulumiEscClient,
    {
      coder: {
        githubApp: {
          clientId: process.env.CODER_GITHUB_APP_CLIENT_ID!!,
          clientSecret: process.env.CODER_GITHUB_APP_CLIENT_SECRET!!,
        },
        firstUser: {
          email: process.env.CODER_FIRST_USER_EMAIL!!,
          username: process.env.CODER_FIRST_USER_USERNAME!!,
          fullName: process.env.CODER_FIRST_USER_FULLNAME!!,
          password: process.env.CODER_FIRST_USER_PASSWORD!!,
        },
      },
      slackWebhookUrlVaultAlerts: process.env.SLACK_WEBHOOK_URL_VAULT_ALERTS!!,
    },
    {
      prod: {},
      dev: {},
    },
  );
}

void syncPulumiEsc();
