import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import yaml from 'yaml';
import { defineComponent } from '../function';
import { TextFileComponent } from './text-file.component';

interface KubeConfigArgsShape {
  name: string;
  fileDirPath: string;
  clustser: {
    certificateAuthorityData: string;
    server: string;
    proxyUrl?: string;
  };
  user?: {
    exec?: {
      apiVersion: string;
      command: string;
      args?: string[];
      env?: {
        name: string;
        value: string;
      }[];
      [key: string]: unknown;
    };
    clientCertificateData?: string;
    clientKeyData?: string;
  };
}

export type KubeConfigComponentArgs =
  utils.types.DeepPulumiInput<KubeConfigArgsShape>;

const toKubeConfigBase64 = (data: string) =>
  Buffer.from(data.replace(/\\n/g, '\n'), 'utf8').toString('base64');

export const KubeConfigComponent = defineComponent(
  'kubeConfig',
  (args: KubeConfigComponentArgs, opts: pulumi.ComponentResourceOptions) => {
    const kubeConfigContent = pulumi.output(args).apply(resolvedArgs => {
      const clusterName = resolvedArgs.name;
      const contextName = clusterName;
      const userName = `${clusterName}-user`;

      const kubeConfig: utils.interfaces.KubeConfig = {
        'apiVersion': 'v1',
        'kind': 'Config',
        'current-context': contextName,
        'clusters': [
          {
            name: clusterName,
            cluster: {
              'server': resolvedArgs.clustser.server,
              'certificate-authority-data': toKubeConfigBase64(
                resolvedArgs.clustser.certificateAuthorityData,
              ),
              'proxy-url': resolvedArgs.clustser.proxyUrl,
            },
          },
        ],
        'contexts': [
          {
            name: contextName,
            context: {
              cluster: clusterName,
              user: userName,
            },
          },
        ],
        'users': [
          {
            name: userName,
            user: {
              'client-certificate-data': resolvedArgs.user
                ?.clientCertificateData
                ? toKubeConfigBase64(resolvedArgs.user.clientCertificateData)
                : undefined,
              'client-key-data': resolvedArgs.user?.clientKeyData
                ? toKubeConfigBase64(resolvedArgs.user.clientKeyData)
                : undefined,
              'exec': resolvedArgs.user?.exec,
            },
          },
        ],
      };

      return yaml.stringify(kubeConfig);
    });

    const kubeConfigFile = new TextFileComponent(
      'kubeConfigFile',
      {
        fileName: `${args.name}.yaml`,
        fileDirPath: args.fileDirPath,
        content: kubeConfigContent,
      },
      {
        ...opts,
      },
    );

    return {
      output: pulumi.output({
        kubeConfigFilePath: kubeConfigFile.output.filePath,
        kubeConfigFileHash: kubeConfigFile.output.fileHash,
      }),
      secret: pulumi.secret({}),
    };
  },
);
