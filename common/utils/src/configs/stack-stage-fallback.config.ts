import fs from 'fs';
import path from 'path';
import { StackStage } from '../enums/stack-stage.enum';

/**
 * 스테이지 우선순위 (낮을수록 하위 환경).
 *
 * callee에 caller stage 스택이 없으면, caller와 같거나 상위 priority stage를
 * priority 오름차순으로 탐색해 `Pulumi.{stage}.yaml`이 존재하는 첫 stage를 참조한다.
 *
 * 예: tools/dev → system (dev 없음, prod 있음) → prod
 */
export const stackPriority: {
  readonly [key in StackStage]: number;
} = {
  [StackStage.DEV]: 0,
  [StackStage.PROD]: 1,
};

export function resolveReferencedStackStage(
  calleeProjectName: string,
  callerStage: string,
  calleeProjectDirPath: string,
): string {
  const callerStageEnum = callerStage as StackStage;
  if (!(callerStageEnum in stackPriority)) {
    throw new Error(
      `Unknown stack stage for ${calleeProjectName}: ${callerStage}`,
    );
  }

  const callerPriority = stackPriority[callerStageEnum];
  const candidateStages = Object.values(StackStage)
    .filter(stage => stackPriority[stage] >= callerPriority)
    .sort((left, right) => stackPriority[left] - stackPriority[right]);

  for (const stage of candidateStages) {
    const stackYamlPath = path.join(
      calleeProjectDirPath,
      `Pulumi.${stage}.yaml`,
    );
    if (fs.existsSync(stackYamlPath)) {
      return stage;
    }
  }

  throw new Error(
    `Stack stage fallback not found for ${calleeProjectName}: ` +
      `requested=${callerStage}, candidates=${candidateStages.join(' → ')}`,
  );
}
