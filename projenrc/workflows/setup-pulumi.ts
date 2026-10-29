import fs from 'node:fs';
import { JobStep } from 'projen/lib/github/workflows-model';
import * as src from '../../src';

/**
 * devcontainer의 Pulumi feature 버전이 `pulumiCliVersion`과 다르면 synth를 멈춘다.
 * devcontainer.json은 projen 생성물이 아니라 손으로 맞춰야 한다.
 */
export function assertDevContainerPulumiCliVersion(): void {
  const devContainerJson = fs.readFileSync(
    '.devcontainer/devcontainer.json',
    'utf-8',
  );
  const actual = devContainerJson.match(
    /"ghcr\.io\/devcontainers-extra\/features\/pulumi:1":\s*\{\s*"version":\s*"([^"]+)"/,
  )?.[1];
  const expected = src.constants.pulumiCliVersion;
  if (actual !== expected) {
    throw new Error(
      `.devcontainer/devcontainer.json의 Pulumi feature version(${actual ?? '없음'})을 src/constants.ts pulumiCliVersion(${expected})과 맞추세요.`,
    );
  }
}

/**
 * Pulumi CLI 설치 전용 스텝. `command` 생략 = installation-only.
 * ubuntu-latest(26.04)는 러너 이미지에 CLI가 없다. SHA 핀은 action-pins.ts.
 * 버전은 `pulumiCliVersion` 고정 (devcontainer와 같은 sdkgen 결과를 내기 위해).
 */
export function setupPulumiCliStep(): JobStep {
  return {
    name: 'Setup Pulumi',
    uses: 'pulumi/actions',
    with: {
      'pulumi-version': src.constants.pulumiCliVersion,
    },
  };
}
