import axios from 'axios';
import { installPulumiMocks, unwrap } from './pulumi-mocks';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

installPulumiMocks();

const axiosGet = axios.get as jest.Mock;

describe('getPolcyExpressionV1', () => {
  beforeEach(() => {
    axiosGet.mockReset();
  });

  test('GETs expression search URL with Bearer and returns matching name', async () => {
    axiosGet.mockResolvedValue({
      data: {
        pagination: {
          next: 0,
          previous: 0,
          count: 1,
          current: 1,
          total_pages: 1,
          start_index: 1,
          end_index: 1,
        },
        results: [
          {
            pk: 'pk-1',
            name: 'unit-policy',
            execution_logging: false,
            component: 'ak_policies.expression.models.ExpressionPolicy',
            verbose_name: 'Expression Policy',
            verbose_name_plural: 'Expression Policies',
            meta_model_name: 'authentik_policies_expression.expressionpolicy',
            bound_to: 1,
            expression: 'return True',
          },
        ],
        autocomplete: {},
      },
    });

    const { getPolcyExpressionV1 } = await import(
      '../src/data/authentik/policy-expression.v1.data'
    );

    const result = await unwrap(
      getPolcyExpressionV1({
        name: 'unit-policy',
        authentikUrl: 'https://authentik.example',
        authentikToken: 'unit-token',
      }),
    );

    expect(axiosGet).toHaveBeenCalledWith(
      'https://authentik.example/api/v3/policies/expression/?search=unit-policy',
      {
        headers: {
          Authorization: 'Bearer unit-token',
        },
      },
    );
    expect(result.name).toBe('unit-policy');
    expect(result.pk).toBe('pk-1');
    expect(result.expression).toBe('return True');
  });
});
