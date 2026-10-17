import {
  containerImages,
  helmChartVersions,
  istioVersion,
  vaultVersion,
} from '../src/configs/versions.config';

describe('versions.config', () => {
  test('vault image follows vaultVersion', () => {
    expect(containerImages.vault).toBe(`hashicorp/vault:${vaultVersion}`);
  });

  test('istio chart follows istioVersion', () => {
    expect(helmChartVersions.istio).toBe(istioVersion);
  });

  test('is frozen', () => {
    expect(Object.isFrozen(helmChartVersions)).toBe(true);
    expect(Object.isFrozen(containerImages)).toBe(true);
  });
});
