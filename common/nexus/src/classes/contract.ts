import fs from 'fs';
import path from 'path';
import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';
import _ from 'lodash';
import yaml from 'yaml';

export class Contract<Output_Type extends Object, Secret_Type extends Object> {
  private readonly projectName: string;
  private readonly stackReference: pulumi.StackReference;

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
        break;
      }
      currentDirPath = path.dirname(currentDirPath);
    }

    if (pulumi.getProject() == this.projectName) {
      const inflated = pulumi.output(Promise.resolve(this.inflate()));
      this.output = pulumi.unsecret(inflated.apply(result => result.output));
      this.secret = inflated.apply(result => result.secret);

      const isOutputChnaged = new random.RandomString('isOutputChnaged', {
        length: 32,
        keepers: {
          output: this.output.apply(output => JSON.stringify(output)),
        },
      });
      const isSecretChnaged = new random.RandomString('isSecretChnaged', {
        length: 32,
        keepers: {
          secret: this.secret.apply(secret => JSON.stringify(secret)),
        },
      });
    }
  }

  fetchOutput() {
    return this.stackReference.requireOutput(
      'output',
    ) as pulumi.Output<Output_Type>;
  }

  fetchSecret() {
    return this.stackReference.requireOutput(
      'secret',
    ) as pulumi.Output<Secret_Type>;
  }
}
