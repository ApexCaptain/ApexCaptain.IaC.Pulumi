import * as utils from '@common/utils/src';
import * as pulumi from '@pulumi/pulumi';
import axios from 'axios';

interface GetPolcyExpressionV1ArgsShape {
  name: string;
  authentikUrl: string;
  authentikToken: string;
}

export type GetPolcyExpressionV1Args =
  utils.types.DeepPulumiInput<GetPolcyExpressionV1ArgsShape>;

type GetPolcyExpressionV1Result = {
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

type GetPolcyExpressionV1AxiosResponse = {
  pagination: {
    next: number;
    previous: number;
    count: number;
    current: number;
    total_pages: number;
    start_index: number;
    end_index: number;
  };
  results: GetPolcyExpressionV1Result[];
  autocomplete: {};
};

export function getPolcyExpressionV1(
  args: GetPolcyExpressionV1Args,
): pulumi.Output<GetPolcyExpressionV1Result> {
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
          } as GetPolcyExpressionV1Result;
        }
        try {
          const axiosResponse =
            await axios.get<GetPolcyExpressionV1AxiosResponse>(
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
