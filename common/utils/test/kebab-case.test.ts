import { kebabCase } from '../src/functions/kebab-case.function';

describe('kebabCase', () => {
  test('preserves k8s token that lodash would split', () => {
    expect(kebabCase('k8s')).toBe('k8s');
    expect(kebabCase('MyK8sCluster')).toBe('my-k8s-cluster');
    expect(kebabCase('k8sWorkstation')).toBe('k8s-workstation');
  });

  test('kebab-cases ordinary PascalCase', () => {
    expect(kebabCase('HelloWorld')).toBe('hello-world');
  });
});
