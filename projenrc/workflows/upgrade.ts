import CronTime from 'cron-time-generator';
import { typescript } from 'projen';
import { Job } from 'projen/lib/github/workflows-model';
import Timezone from 'timezone-enum';
import { setupPulumiCliStep } from './setup-pulumi';

export async function modifyUpgradeWorkflow(
  rootProject: typescript.TypeScriptProject,
): Promise<void> {
  const upgradeWorkflow = rootProject.upgradeWorkflow;
  if (!upgradeWorkflow) return;

  const upgradeJob = upgradeWorkflow.workflows[0].jobs.upgrade as Job;
  const upgradeJobSteps = upgradeJob.steps;

  upgradeWorkflow.workflows[0].on({
    schedule: [
      {
        cron: CronTime.everyWeekAt(1, 1), // 매주 월요일 새벽 1시
        timezone: Timezone['Asia/Seoul'],
      },
    ],
  });

  upgradeJobSteps.splice(
    upgradeJobSteps.findIndex(eachStep => eachStep.name == 'Setup pnpm') + 1,
    0,
    setupPulumiCliStep(),
  );

  // Build Projects Step 추가
  upgradeJobSteps.splice(
    upgradeJobSteps.findIndex(
      eachStep => eachStep.name == 'Install dependencies',
    ) + 1,
    0,
    {
      name: 'Build Projects',
      run: 'pnpm build:workspaces',
    },
  );

  // Deps Upgrade Step에 Pulumi Access Token 및 기타 환경변수 추가
  upgradeJobSteps.splice(
    upgradeJobSteps.findIndex(
      eachStep => eachStep.name == 'Upgrade dependencies',
    ),
    1,
    {
      name: 'Upgrade dependencies',
      run: 'pnpm exec projen upgrade',
      env: {
        CI: '0',
        PULUMI_ACCESS_TOKEN: '${{ secrets.PULUMI_ACCESS_TOKEN }}',
      },
    },
  );
}
