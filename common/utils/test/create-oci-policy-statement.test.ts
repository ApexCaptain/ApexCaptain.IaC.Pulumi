import { createOciPolicyStatement } from '../src/functions/create-oci-policy-statement.function';

describe('createOciPolicyStatement', () => {
  test('formats group + compartment-id + condition', () => {
    expect(
      createOciPolicyStatement({
        subject: { type: 'group', targets: ['vault-kms-unseal'] },
        verb: 'use',
        resourceType: 'keys',
        location: {
          type: 'compartment-id',
          expression: 'ocid1.compartment.example',
        },
        condition: "target.key.id = 'ocid1.key.example'",
      }),
    ).toBe(
      "Allow group vault-kms-unseal to use keys in compartment id ocid1.compartment.example where target.key.id = 'ocid1.key.example'",
    );
  });

  test('formats any-user in tenancy', () => {
    expect(
      createOciPolicyStatement({
        subject: 'any-user',
        verb: 'inspect',
        resourceType: 'all-resources',
        location: 'tenancy',
      }),
    ).toBe('Allow any-user to inspect all-resources in tenancy');
  });

  test('prefixes Identity Domain on group names', () => {
    expect(
      createOciPolicyStatement({
        subject: {
          type: 'group',
          targets: ['vault-kms-unseal'],
          domain: 'Default',
        },
        verb: 'read',
        resourceType: 'vaults',
        location: 'tenancy',
      }),
    ).toBe('Allow group Default/vault-kms-unseal to read vaults in tenancy');
  });

  test('throws on empty resourceType', () => {
    expect(() =>
      createOciPolicyStatement({
        subject: 'any-group',
        verb: 'read',
        resourceType: '',
        location: 'tenancy',
      }),
    ).toThrow();
  });
});
