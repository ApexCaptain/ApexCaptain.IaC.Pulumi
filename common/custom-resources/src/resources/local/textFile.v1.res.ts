import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as utils from '@common/utils/src';
import * as command from '@pulumi/command';
import * as pulumi from '@pulumi/pulumi';
import dedent from 'dedent';

interface TextFileV1ArgsShape {
  fileName: string;
  fileDirPath: string;
  content: string;
  fileMode?: string;
  deleteDirWhenEmpty?: boolean;
}

export type TextFileV1Args = utils.types.DeepPulumiInput<TextFileV1ArgsShape>;

export class TextFileV1 extends command.local.Command {
  readonly filePath: pulumi.Output<string>;
  readonly fileHash: pulumi.Output<string>;

  constructor(
    name: string,
    args: TextFileV1Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
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

    const createCommand = pulumi
      .all([filePath, args.content, args.fileDirPath, args.fileMode])
      .apply(
        async ([
          resolvedFilePath,
          resolvedContent,
          resolvedFileDirPath,
          resolvedFileMode,
        ]) => {
          const defaultCreateCommand = `mkdir -p "${resolvedFileDirPath}" && cat << 'EOF' > "${resolvedFilePath}"\n${resolvedContent}\nEOF`;
          if (!resolvedFileMode) {
            return defaultCreateCommand;
          }
          if (!utils.functions.isValidFileModeString(resolvedFileMode)) {
            throw new Error(`Invalid file mode string: ${resolvedFileMode}`);
          }
          return dedent`
                  ${defaultCreateCommand}
                  chmod ${resolvedFileMode} "${resolvedFilePath}"
                `;
        },
      );

    const deleteCommand = pulumi
      .all([filePath, args.fileDirPath, args.deleteDirWhenEmpty])
      .apply(
        ([
          resolvedFilePath,
          resolvedFileDirPath,
          resolvedDeleteDirWhenEmpty,
        ]) => {
          const defaultDeleteCommand = `rm -f "${resolvedFilePath}"`;

          if (!resolvedDeleteDirWhenEmpty) {
            return defaultDeleteCommand;
          }

          return `${defaultDeleteCommand} && if [ -d "${resolvedFileDirPath}" ] && ! find "${resolvedFileDirPath}" -mindepth 1 -print -quit | read; then rmdir "${resolvedFileDirPath}" || true; fi`;
        },
      );
    super(
      name,
      {
        create: createCommand,
        delete: deleteCommand,
        environment: {
          TEXT_FILE_CONTENT: args.content,
          TEXT_FILE_HASH: fileHash,
        },
      },
      opts,
    );
    this.filePath = filePath;
    this.fileHash = fileHash;
  }
}
