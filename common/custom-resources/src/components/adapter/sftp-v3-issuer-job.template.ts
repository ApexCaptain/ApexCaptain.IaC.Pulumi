import fs from 'node:fs';
import path from 'node:path';

const CUSTOM_RESOURCES_PACKAGE_NAME = '@common/custom-resources';
const TEMPLATE_FILE = 'sftp-v3-issuer-job.sh.tpl';

function resolveCustomResourcesPackageRoot(): string {
  let dir = __dirname;

  while (true) {
    const packageJsonPath = path.join(dir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(
        fs.readFileSync(packageJsonPath, 'utf8'),
      ) as { name?: string };
      if (pkg.name === CUSTOM_RESOURCES_PACKAGE_NAME) {
        return dir;
      }
    }

    const parentDir = path.dirname(dir);
    if (parentDir === dir) {
      break;
    }
    dir = parentDir;
  }

  throw new Error(
    `could not resolve ${CUSTOM_RESOURCES_PACKAGE_NAME} package root from ${__dirname}`,
  );
}

function loadSftpV3IssuerJobTemplate(): string {
  const packageRoot = resolveCustomResourcesPackageRoot();
  const templatePath = path.join(
    packageRoot,
    'templates',
    TEMPLATE_FILE,
  );
  if (!fs.existsSync(templatePath)) {
    throw new Error(`SFTP v3 issuer job template not found: ${templatePath}`);
  }
  return fs.readFileSync(templatePath, 'utf8');
}

const sftpV3IssuerJobTemplate = loadSftpV3IssuerJobTemplate();

export type SftpV3IssuerJobTemplateVars = {
  vaultAddress: string;
  k8sMount: string;
  k8sRole: string;
  userCaMount: string;
  hostCaMount: string;
  userRole: string;
  hostRole: string;
  hostPrincipals: string;
  username: string;
  kvMount: string;
  hostKvPath: string;
  userKvPath: string;
  namespace: string;
  adapter: string;
  userIssueTtl: string;
  hostIssueTtl: string;
  userKeyOverlap: string;
};

export function renderSftpV3IssuerJobScript(
  vars: SftpV3IssuerJobTemplateVars,
): string {
  const replacements: Record<string, string> = {
    __VAULT_ADDR_JSON__: JSON.stringify(vars.vaultAddress),
    __K8S_MOUNT__: vars.k8sMount,
    __K8S_ROLE__: vars.k8sRole,
    __USER_CA_MOUNT__: vars.userCaMount,
    __HOST_CA_MOUNT__: vars.hostCaMount,
    __USER_ROLE__: vars.userRole,
    __HOST_ROLE__: vars.hostRole,
    __HOST_PRINCIPALS__: vars.hostPrincipals,
    __USERNAME__: vars.username,
    __KV_MOUNT__: vars.kvMount,
    __HOST_KV_PATH__: vars.hostKvPath,
    __USER_KV_PATH__: vars.userKvPath,
    __NAMESPACE__: vars.namespace,
    __ADAPTER__: vars.adapter,
    __USER_ISSUE_TTL__: vars.userIssueTtl,
    __HOST_ISSUE_TTL__: vars.hostIssueTtl,
    __USER_KEY_OVERLAP__: vars.userKeyOverlap,
  };

  let script = sftpV3IssuerJobTemplate;
  for (const [token, value] of Object.entries(replacements)) {
    script = script.split(token).join(value);
  }
  return script;
}
