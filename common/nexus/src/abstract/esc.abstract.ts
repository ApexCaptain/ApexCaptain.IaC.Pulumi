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
      } catch (error) {
        // 이미 존재(409)만 무시. esc-sdk는 2xx 외 응답에서 AxiosError를 던진다.
        const status = (error as { response?: { status?: number } })?.response
          ?.status;
        if (status !== 409) {
          throw error;
        }
      }
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
