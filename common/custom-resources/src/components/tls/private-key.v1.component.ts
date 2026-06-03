import path from 'node:path';
import * as utils from '@common/utils/src';
import * as command from '@pulumi/command';
import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';
import * as tls from '@pulumi/tls';
import { TextFileV1 } from '../../resources/local/textFile.v1.res';

interface PrivateKeyV1ArgsShape {
  expirationDateString: string;
  createKeyFile?: boolean;
}

export type PrivateKeyV1Args =
  utils.types.DeepPulumiInput<PrivateKeyV1ArgsShape>;

export const PrivateKeyV1Component = utils.functions.defineComponent(
  'tls:privateKey:v1',
  (
    args: PrivateKeyV1Args,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const anchor = new random.RandomUuid7(
      `${resourceName}-anchor`,
      {
        keepers: {
          expirationDateString: args.expirationDateString,
        },
      },
      {
        ...opts,
      },
    );

    const privateKey = new tls.PrivateKey(
      `${resourceName}-privateKey`,
      {
        // @Note 이 2개 옵션은 고정으로 사용해도 별 문제 없을듯?
        algorithm: 'RSA',
        rsaBits: 4096,
      },
      {
        ...opts,
        replacementTrigger: anchor.id,
      },
    );

    const fileDirPath = pulumi
      .output(opts.parent?.urn ?? pulumi.output(''))
      .apply(resolvedParentUrn => {
        return path.join(
          process.env.PULUMI_CONTRACT_KEYS_DIR_PATH!!,
          pulumi.getProject(),
          pulumi.getStack(),
          resolvedParentUrn.split('::')[2],
        );
      });

    const privateKeyFile = pulumi
      .output(args.createKeyFile)
      .apply(resolvedCreateKeyFile => {
        if (!resolvedCreateKeyFile) {
          return;
        }
        return new TextFileV1(
          `${resourceName}-privateKeyFile`,
          {
            fileDirPath,
            fileName: `${resourceName}.key`,
            content: privateKey.privateKeyOpenssh,
            fileMode: '600',
            deleteDirWhenEmpty: true,
          },
          {
            ...opts,
            dependsOn: [privateKey],
          },
        );
      });

    return {
      output: pulumi.output({
        keyFilePath: privateKeyFile.apply(
          resolvedPrivateKeyFile => resolvedPrivateKeyFile?.filePath,
        ),
        publicKeyOpenSsh: privateKey.publicKeyOpenssh,
      }),
      secret: pulumi.secret({}),
    };
  },
);
