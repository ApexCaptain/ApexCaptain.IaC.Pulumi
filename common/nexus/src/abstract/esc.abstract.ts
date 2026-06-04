import * as utils from '@common/utils/src';
import * as pulumiEscSdk from '@pulumi/esc-sdk';
import * as pulumi from '@pulumi/pulumi';
import _ from 'lodash';
import { z } from 'zod';

export abstract class AbstractEsc<
  ESC_Schema extends z.ZodObject<z.ZodRawShape>,
> {
  private readonly pulumiConfig = new pulumi.Config();

  constructor(
    private readonly escName: string,
    private readonly escSchema: ESC_Schema,
  ) {}

  get esc() {
    return this.pulumiConfig.requireSecretObject<z.infer<ESC_Schema>>(
      this.escName,
    );
  }

  getEscNameWithStage(stage: utils.enums.StackStage) {
    return `${this.escName}/${stage}`;
  }

  async upsertEsc(
    orgName: string,
    escClient: pulumiEscSdk.EscApi,
    defaultSecret: utils.types.DeepPartial<z.infer<ESC_Schema>>,
    stageSecrets: {
      [key in utils.enums.StackStage]?: utils.types.DeepPartial<
        z.infer<ESC_Schema>
      >;
    },
  ) {
    for (const [stage, secret] of Object.entries(stageSecrets) as [
      utils.enums.StackStage,
      utils.types.DeepPartial<z.infer<ESC_Schema>>,
    ][]) {
      const mergedSecret = _.mergeWith(
        {},
        defaultSecret,
        secret,
        utils.functions.mergeCustomizer,
      );

      const parseResult = this.escSchema.safeParse(mergedSecret);
      if (!parseResult.success) {
        throw new Error(
          `Invalid secret for ${orgName}/${this.getEscNameWithStage(stage as utils.enums.StackStage)}: ${parseResult.error.message}`,
        );
      }

      try {
        await escClient.createEnvironment(orgName, this.escName, stage);
      } catch (error) {}
      await escClient.updateEnvironment(orgName, this.escName, stage, {
        values: {
          pulumiConfig: {
            [this.escName]: parseResult.data,
          },
        },
      });
    }
  }
}
