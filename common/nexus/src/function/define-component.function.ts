import * as pulumi from '@pulumi/pulumi';

type InflateResult<Output_Type extends object, Secret_Type extends object> = {
  output: pulumi.Output<Output_Type>;
  secret: pulumi.Output<Secret_Type>;
};

type ComponentConstructor<
  Args_Type extends pulumi.Inputs,
  Output_Type extends object,
  Secret_Type extends object,
> = new (
  name: string,
  args: Args_Type,
  opts?: pulumi.ComponentResourceOptions,
) => pulumi.ComponentResource & {
  output: pulumi.Output<Output_Type>;
  secret: pulumi.Output<Secret_Type>;
};

abstract class AbstractComponent<
  Args_Type extends pulumi.Inputs,
  Output_Type extends object = object,
  Secret_Type extends object = object,
>
  extends pulumi.ComponentResource {
  public readonly output: pulumi.Output<Output_Type>;
  public readonly secret: pulumi.Output<Secret_Type>;

  constructor(
    type: string,
    name: string,
    args: Args_Type,
    inflate: (
      args: Args_Type,
      opts: pulumi.ComponentResourceOptions,
    ) => InflateResult<Output_Type, Secret_Type>,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(`Nexus:Component:${type}`, name, args, opts);

    const { output, secret } = inflate(args, {
      parent: this,
      ...opts,
    });

    this.output = output;
    this.secret = secret;

    this.registerOutputs({
      output: this.output,
      secret: this.secret,
    });
  }
}

export function defineComponent<
  Args_Type extends pulumi.Inputs,
  Output_Type extends object,
  Secret_Type extends object,
>(
  type: string,
  inflate: (
    args: Args_Type,
    opts: pulumi.ComponentResourceOptions,
  ) => InflateResult<Output_Type, Secret_Type>,
) {
  class DefinedComponent extends AbstractComponent<
    Args_Type,
    Output_Type,
    Secret_Type
  > {
    constructor(
      name: string,
      args: Args_Type,
      opts?: pulumi.ComponentResourceOptions,
    ) {
      super(type, name, args, inflate, opts);
    }
  }

  return DefinedComponent as ComponentConstructor<
    Args_Type,
    Output_Type,
    Secret_Type
  >;
}
