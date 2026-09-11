import CronTime from 'cron-time-generator';
import { typescript } from 'projen';
import { Job } from 'projen/lib/github/workflows-model';
import Timezone from 'timezone-enum';

export async function modifyUpgradeWorkflow(
  rootProject: typescript.TypeScriptProject,
): Promise<void> {
  const upgradeWorkflow = rootProject.upgradeWorkflow;
  if (!upgradeWorkflow) return;

  const upgradeJob = upgradeWorkflow.workflows[0].jobs.upgrade as Job;
  const upgradeJobSteps = upgradeJob.steps;

  // @Note Workflow Schedule에 강제로 Timezone 설정. 매우 지저분, 눈이 썩을 거 같음.
  // @ToDo Timezone 설정 나온 지 3개월은 되었는데 Projen 이놈들 이거 언제 업데이트 해주려나? Issue 한 번 올려서 물어봐야 할 듯
  upgradeWorkflow.workflows[0].on({
    schedule: [
      {
        cron: CronTime.everyWeekAt(1, 1), // 매주 월요일 새벽 1시
        timezone: Timezone['Asia/Seoul'],
      } as any,
    ],
  });

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
