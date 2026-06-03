import fs from 'fs';
import path from 'path';
import * as customResources from '@common/custom-resources';
import * as pulumi from '@pulumi/pulumi';
import * as std from '@pulumi/std';
import _ from 'lodash';
import yaml from 'yaml';

export class Contract<Output_Type extends Object, Secret_Type extends Object> {
  private readonly projectName: string;
  private readonly stackReference: pulumi.StackReference;
  private readonly contractHashDirPath: string;
  private readonly isFromStackReference: boolean;

  readonly output!: pulumi.Output<Output_Type>;
  readonly secret!: pulumi.Output<Secret_Type>;

  constructor(
    callerPath: string,
    private readonly inflate: () =>
      | {
        output: pulumi.Output<Output_Type>;
        secret: pulumi.Output<Secret_Type>;
      }
      | Promise<{
        output: pulumi.Output<Output_Type>;
        secret: pulumi.Output<Secret_Type>;
      }>,
  ) {
    // Lazy Initialization
    let currentDirPath = fs.statSync(callerPath).isDirectory()
      ? callerPath
      : path.dirname(callerPath);
    while (true) {
      if (currentDirPath === '/') {
        throw new Error('Pulumi.yaml not found');
      }
      const pulumiYamlFilePath = path.join(currentDirPath, 'Pulumi.yaml');
      if (fs.existsSync(pulumiYamlFilePath)) {
        const foundName = yaml.parse(
          fs.readFileSync(pulumiYamlFilePath, 'utf8'),
        ).name;
        if (!foundName) {
          throw new Error('Pulumi.yaml "name" field not found');
        }
        this.projectName = foundName;
        const stackYamlFilePath = path.join(
          currentDirPath,
          `Pulumi.${pulumi.getStack()}.yaml`,
        );
        this.stackReference = new pulumi.StackReference(
          `${pulumi.getOrganization()}/${this.projectName}/${
            fs.existsSync(stackYamlFilePath) ? pulumi.getStack() : 'prod'
          }`,
        );
        this.contractHashDirPath = path.join(
          process.env.PULUMI_CONTRACT_HASH_DIR_PATH!!,
          this.projectName,
        );
        break;
      }
      currentDirPath = path.dirname(currentDirPath);
    }
    this.isFromStackReference = pulumi.getProject() != this.projectName;

    // Inflate Contract
    if (this.isFromStackReference) {
      this.output = this.stackReference.requireOutput(
        'output',
      ) as pulumi.Output<Output_Type>;
      this.secret = this.stackReference.requireOutput(
        'secret',
      ) as pulumi.Output<Secret_Type>;
    } else {
      const inflated = pulumi.output(Promise.resolve(this.inflate()));
      this.output = pulumi.unsecret(inflated.apply(result => result.output));
      this.secret = inflated.apply(result => result.secret);

      new customResources.resources.local.TextFileV1('outputHashFile', {
        fileDirPath: this.contractHashDirPath,
        fileName: `${pulumi.getStack()}.output.hash`,
        content: this.output.apply(
          async output =>
            (await std.md5({ input: JSON.stringify(output) })).result,
        ),
      });
      new customResources.resources.local.TextFileV1('secretHashFile', {
        fileDirPath: this.contractHashDirPath,
        fileName: `${pulumi.getStack()}.secret.hash`,
        content: this.secret.apply(
          async secret =>
            (await std.md5({ input: JSON.stringify(secret) })).result,
        ),
      });
    }
  }
}
