import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as utils from '@common/utils/src';
import * as command from '@pulumi/command';
import * as pulumi from '@pulumi/pulumi';
import { defineComponent } from '../function';

interface TextFileComponentArgShape {
  fileName: string;
  fileDirPath: string;
  content: string;
}

export type TextFileComponentArgs =
  utils.types.DeepPulumiInput<TextFileComponentArgShape>;

export const TextFileComponent = defineComponent(
  'textFile',
  (args: TextFileComponentArgs, opts: pulumi.ComponentResourceOptions) => {
    const filePath = pulumi
      .all([args.fileDirPath, args.fileName])
      .apply(([resolvedFileDirPath, resolvedFileName]) => {
        return path.join(resolvedFileDirPath, resolvedFileName);
      });

    const fileHash = pulumi
      .all([filePath, args.content])
      .apply(([resolvedFilePath, resolvedContent]) => {
        try {
          return crypto
            .createHash('sha256')
            .update(
              fs.existsSync(resolvedFilePath)
                ? fs.readFileSync(resolvedFilePath)
                : resolvedContent,
            )
            .digest('hex');
        } catch (error) {}
        return 'initial-deployment';
      });

    new command.local.Command(
      'createTextFile',
      {
        create: pulumi.interpolate`mkdir -p ${args.fileDirPath} && cat << 'EOF' > ${filePath}\n${args.content}\nEOF`,
        delete: pulumi.interpolate`rm -f ${filePath}`,
        environment: {
          TEXT_FILE_CONTENT: args.content,
          TEXT_FILE_HASH: fileHash,
        },
      },
      {
        ...opts,
      },
    );

    return {
      output: pulumi.output({
        filePath,
        fileHash,
      }),
      secret: pulumi.secret({}),
    };
  },
);
