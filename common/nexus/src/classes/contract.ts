import * as pulumi from '@pulumi/pulumi';
import _ from 'lodash';

export class Contract<Output_Type extends Object, Secret_Type extends Object> {
  private readonly stackReference = new pulumi.StackReference(
    `${pulumi.getOrganization()}/${this.projectName}/${pulumi.getStack()}`,
  );

  readonly output!: pulumi.Output<Output_Type>;
  readonly secret!: pulumi.Output<Secret_Type>;

  constructor(
    private readonly projectName: string,
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
    const inflated = pulumi.output(Promise.resolve(this.inflate()));
    this.output = pulumi.unsecret(inflated.apply(result => result.output));
    this.secret = inflated.apply(result => result.secret);
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
