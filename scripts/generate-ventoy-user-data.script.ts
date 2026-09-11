import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { sha512 } from 'sha512-crypt-ts';
import * as src from '../src';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `script:generateVentoyUserData: missing required env ${name}`,
    );
  }
  return value;
}

async function generateVentoyUserData(): Promise<void> {
  requireEnv('WORKSTATION_BOOTSTRAP_PASSWORD');

  const ventoyWorkstationNodeUserDataTemplate = fs.readFileSync(
    path.join(
      process.cwd(),
      src.constants.paths.dirs.ventoyDir,
      'templates',
      'workstation-node.yaml.tpl',
    ),
    'utf-8',
  );

  const ventoyUserDataDirPath = path.join(
    process.cwd(),
    src.constants.paths.dirs.ventoyUserDataDir,
  );
  if (!fs.existsSync(ventoyUserDataDirPath)) {
    fs.mkdirSync(ventoyUserDataDirPath, { recursive: true });
  }

  const ventoyWorkstationNodeUserDataFilePath = path.join(
    ventoyUserDataDirPath,
    'workstation-node.yaml',
  );

  fs.writeFileSync(
    ventoyWorkstationNodeUserDataFilePath,
    Handlebars.compile(ventoyWorkstationNodeUserDataTemplate)({
      gatewayIp: process.env.WORKSTATION_BOOTSTRAP_GATEWAY_IP,
      nameServersAddresses: [
        process.env.WORKSTATION_BOOTSTRAP_NAMESERVER_ADDRESS_0,
        process.env.WORKSTATION_BOOTSTRAP_NAMESERVER_ADDRESS_1,
      ],
      hostname: process.env.WORKSTATION_BOOTSTRAP_TEMPORARY_HOST_NAME,
      userName: process.env.WORKSTATION_BOOTSTRAP_USERNAME,
      passwordHash: sha512.crypt(
        process.env.WORKSTATION_BOOTSTRAP_PASSWORD!!,
        `$6$rounds=4096$${randomBytes(8)
          .toString('base64')
          .replace(/[^a-zA-Z0-9]/g, '')
          .slice(0, 16)}`,
      ),
      authorizedKeys: [process.env.WORKSTATION_BOOTSTRAP_SSH_PUBLIC_KEY],
      nodes: [
        {
          id: process.env.WORKSTATION_BOOTSTRAP_NODE_0_HOSTNAME,
          macAddress: process.env.WORKSTATION_BOOTSTRAP_NODE_0_MACADDRESS,
          addressCidr: `${process.env.WORKSTATION_BOOTSTRAP_NODE_0_STATIC_IP}/24`,
        },
      ],
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL_VENTOY_AUTO_INSTALL,
    }),
  );
}

void generateVentoyUserData();
