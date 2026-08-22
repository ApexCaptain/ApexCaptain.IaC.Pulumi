import fs from 'fs';
import path from 'path';
import { Client } from 'ssh2';
import yaml from 'yaml';
import { connectSsh, execSsh } from './common';
import { KubeConfig } from '../common/utils/src/interfaces/kubeconfig.interface';

/**
 * 원격 Workstation 노드에 SSH로 접속하여 Kubernetes admin.conf를 가져온 뒤,
 * 로컬 환경에서 접근 가능하도록 클러스터 엔드포인트 및 컨텍스트를 커스터마이징하여 로컬 파일로 저장합니다.
 */
async function fetchWorkstationKubeconfig(): Promise<void> {
  const client = new Client();

  // 1. SSH 접속 설정 및 연결
  await connectSsh(client, {
    host: process.env.WORKSTATION_DOMAIN_IPTIME!,
    port: Number(process.env.WORKSTATION_BOOTSTRAP_NODE_0_EXTERNAL_SSH_PORT),
    username: process.env.WORKSTATION_BOOTSTRAP_USERNAME!,
    privateKey: fs.readFileSync(
      process.env.WORKSTATION_SSH_PRIVATE_KEY_FILE_ABSOLUTE_PATH!,
    ),
  });

  // 2. 원격 노드의 /etc/kubernetes/admin.conf 파일을 sudo 권한으로 읽기
  const result = await execSsh(
    client,
    'sudo -S -p "" cat /etc/kubernetes/admin.conf',
    `${process.env.WORKSTATION_BOOTSTRAP_PASSWORD}\n`,
  );
  client.end();

  if (result.code !== 0) {
    throw new Error(
      `Failed to read /etc/kubernetes/admin.conf (exit code ${result.code}): ${result.stderr || result.stdout}`,
    );
  }

  const rawKubeConfigString = result.stdout;
  const kubeConfig = yaml.parse(rawKubeConfigString) as KubeConfig;

  // 3. 다중 클러스터 병합(Merge) 충돌 방지를 위해 컨텍스트 및 클러스터 이름을 'ws'로 통일하고
  //    외부 접속용 도메인 및 포트로 엔드포인트 URL 재설정
  kubeConfig.clusters[0].name = 'ws';
  kubeConfig.clusters[0].cluster.server = `https://${process.env.WORKSTATION_DOMAIN_IPTIME}:${process.env.WORKSTATION_EXTERNAL_KUBE_API_PORT}`;
  kubeConfig.contexts[0].name = 'ws';
  kubeConfig.contexts[0].context.cluster = 'ws';
  kubeConfig.contexts[0].context.user = 'ws';
  kubeConfig.users[0].name = 'ws';
  kubeConfig['current-context'] = 'ws';

  // 4. 대상 디렉터리 생성 및 kubeconfig 파일 저장
  const targetPath = process.env.KUBE_CONFIG_WORKSTATION_FILE_PATH!;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, yaml.stringify(kubeConfig));
}

void fetchWorkstationKubeconfig();
