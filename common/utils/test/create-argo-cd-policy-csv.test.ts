import {
  createArgoCdPolicyBinding,
  createArgoCdPolicyCsv,
  createArgoCdPolicyPermission,
} from '../src/functions/create-argo-cd-policy-csv.function';

describe('createArgoCdPolicyPermission', () => {
  test('formats a Casbin p line with default allow', () => {
    expect(
      createArgoCdPolicyPermission({
        role: 'role:deployer',
        resource: 'applications',
        action: '*',
        object: 'default/my-app',
      }),
    ).toBe('p, role:deployer, applications, *, default/my-app, allow');
  });

  test('throws on empty role', () => {
    expect(() =>
      createArgoCdPolicyPermission({
        role: '',
        resource: 'applications',
        action: 'get',
        object: 'default/app',
      }),
    ).toThrow();
  });
});

describe('createArgoCdPolicyBinding', () => {
  test('formats a Casbin g line', () => {
    expect(
      createArgoCdPolicyBinding({
        subject: 'gitops-default-deployer',
        role: 'role:deployer',
      }),
    ).toBe('g, gitops-default-deployer, role:deployer');
  });
});

describe('createArgoCdPolicyCsv', () => {
  test('joins permissions then bindings', () => {
    expect(
      createArgoCdPolicyCsv({
        permissions: [
          {
            role: 'role:deployer',
            resource: 'applications',
            action: '*',
            object: 'default/my-app',
          },
        ],
        bindings: [
          { subject: 'gitops-default-deployer', role: 'role:deployer' },
        ],
      }),
    ).toBe(
      [
        'p, role:deployer, applications, *, default/my-app, allow',
        'g, gitops-default-deployer, role:deployer',
      ].join('\n'),
    );
  });
});
