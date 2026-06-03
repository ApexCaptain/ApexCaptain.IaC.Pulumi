import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import yaml from 'yaml';
import { TextFileV1 } from '../local/textFile.v1.res';

interface KubeConfigFileV1ArgsShape {
  name: string;
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

export type KubeConfigFileV1Args =
  utils.types.DeepPulumiInput<KubeConfigFileV1ArgsShape>;

const toKubeConfigBase64 = (data: string) =>
  Buffer.from(data.replace(/\\n/g, '\n'), 'utf8').toString('base64');

export class KubeConfigFileV1 extends TextFileV1 {
  constructor(
    name: string,
    args: KubeConfigFileV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
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

    super(
      name,
      {
        fileName: `${args.name}.yaml`,
        fileDirPath: process.env.PULUMI_GENERATED_KUBECONFIG_DIR_PATH!!,
        content: kubeConfigContent,
      },
      opts,
    );
  }
}
