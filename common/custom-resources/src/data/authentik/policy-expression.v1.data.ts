import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import axios from 'axios';

interface GetPolicyExpressionV1ArgsShape {
  name: string;
  authentikUrl: string;
  authentikToken: string;
}

export type GetPolicyExpressionV1Args =
  utils.types.DeepPulumiInput<GetPolicyExpressionV1ArgsShape>;

type GetPolicyExpressionV1Result = {
  pk: string;
  name: string;
  execution_logging: boolean;
  component: string;
  verbose_name: string;
  verbose_name_plural: string;
  meta_model_name: string;
  bound_to: 1;
  expression: string;
};

type GetPolicyExpressionV1AxiosResponse = {
  pagination: {
    next: number;
    previous: number;
    count: number;
    current: number;
    total_pages: number;
    start_index: number;
    end_index: number;
  };
  results: GetPolicyExpressionV1Result[];
  autocomplete: {};
};

export function getPolicyExpressionV1(
  args: GetPolicyExpressionV1Args,
): pulumi.Output<GetPolicyExpressionV1Result> {
  return pulumi
    .all([args.name, args.authentikUrl, args.authentikToken])
    .apply(
      async ([resolvedName, resolvedAuthentikUrl, resolvedAuthentikToken]) => {
        if (pulumi.runtime.isDryRun()) {
          return {
            pk: 'Preview PK',
            name: resolvedName,
            execution_logging: false,
            component: 'Preview Component',
            verbose_name: 'Preview Verbose Name',
            verbose_name_plural: 'Preview Verbose Name Plural',
            meta_model_name: 'Preview Meta Model Name',
            bound_to: 1,
            expression: 'Preview Expression',
          } as GetPolicyExpressionV1Result;
        }
        try {
          const axiosResponse =
            await axios.get<GetPolicyExpressionV1AxiosResponse>(
              `${resolvedAuthentikUrl}/api/v3/policies/expression/?search=${resolvedName}`,
              {
                headers: {
                  Authorization: `Bearer ${resolvedAuthentikToken}`,
                },
              },
            );

          const foundResult = axiosResponse.data.results.find(
            result => result.name === resolvedName,
          );
          if (!foundResult) {
            throw new Error(`Policy expression ${resolvedName} not found`);
          }

          return foundResult;
        } catch (error) {
          await pulumi.log.error(
            `Error getting policy expression ${resolvedName}: ${error}`,
          );
          throw error;
        }
      },
    );
}
