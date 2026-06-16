import fs from 'fs';
import path from 'path';
import { Client, type ConnectConfig } from 'ssh2';
import yaml from 'yaml';
import { KubeConfig } from '../common/utils/src/interfaces/kubeconfig.interface';
function connect(client: Client, config: ConnectConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once('ready', resolve).once('error', reject).connect(config);
  });
}
function exec(
  client: Client,
  command: string,
  stdin?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    client.exec(command, { pty: true }, (err, stream) => {
      if (err) return reject(err);
      if (stdin) stream.write(stdin);
      let stdout = '';
      let stderr = '';
      stream
        .on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
        })
        .stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        })
        .on('close', (code: number) => {
          resolve({ stdout, stderr, code });
        });
    });
  });
}
async function fetchWorkstationKubeconfig() {
  const client = new Client();
  await connect(client, {
    host: process.env.WORKSTATION_DOMAIN_IPTIME!,
    port: Number(process.env.WORKSTATION_BOOTSTRAP_NODE_0_EXTERNAL_SSH_PORT),
    username: process.env.WORKSTATION_BOOTSTRAP_USERNAME!,
    privateKey: fs.readFileSync(
      process.env.WORKSTATION_SSH_PRIVATE_KEY_FILE_ABSOLUTE_PATH!,
    ),
    passphrase: process.env.WORKSTATION_BOOTSTRAP_SSH_PRIVATE_KEY_PASSPHRASE!,
  });
  const rawKubeConfigString = (
    await exec(
      client,
      'sudo -S cat /etc/kubernetes/admin.conf',
      `${process.env.WORKSTATION_BOOTSTRAP_PASSWORD}\n`,
    )
  ).stdout;
  client.end();

  const kubeConfig = yaml.parse(rawKubeConfigString) as KubeConfig;
  kubeConfig.clusters[0].name = 'ws';
  kubeConfig.clusters[0].cluster.server = `https://${process.env.WORKSTATION_DOMAIN_IPTIME}:${process.env.WORKSTATION_EXTERNAL_KUBE_API_PORT}`;
  kubeConfig.contexts[0].name = 'ws';
  kubeConfig.contexts[0].context.cluster = 'ws';
  kubeConfig.contexts[0].context.user = 'ws';
  kubeConfig.users[0].name = 'ws';
  kubeConfig['current-context'] = 'ws';

  fs.writeFileSync(
    process.env.KUBE_CONFIG_WORKSTATION_FILE_PATH!!,
    yaml.stringify(kubeConfig),
  );
}
void fetchWorkstationKubeconfig();
