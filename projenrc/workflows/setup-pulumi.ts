import { JobStep } from 'projen/lib/github/workflows-model';

/**
 * Pulumi CLI 설치 전용 스텝. `command` 생략 = installation-only.
 * ubuntu-latest(26.04)는 러너 이미지에 CLI가 없다. SHA 핀은 action-pins.ts.
 */
export function setupPulumiCliStep(): JobStep {
  return {
    name: 'Setup Pulumi',
    uses: 'pulumi/actions',
    with: {
      'pulumi-version': '^3',
    },
  };
}
