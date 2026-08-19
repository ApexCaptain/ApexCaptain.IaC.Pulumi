import fs from 'node:fs';
import path from 'node:path';
import { Agent } from '@cursor/sdk';
import chalk from 'chalk';
import dedent from 'dedent';
import * as src from '../src';
import {
  checkSecretLeak,
  cleanMarkdownCodeFence,
  getGitOutput,
  loadSkillRules,
} from './common';

/**
 * Git Staged 및 Unstaged 변경 사항을 분석하고,
 * 프로젝트 커밋 규칙 및 Caveman Commit(초압축·군더더기 배제) 스킬 규칙을 선택적으로 로드하여
 * Cursor SDK로 커밋 메시지를 생성한 뒤 .github/generated/commit-message.txt에 저장합니다.
 */
async function generateCommitMessage(): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error(
      chalk.red('[오류] CURSOR_API_KEY 환경변수가 설정되어 있지 않습니다.'),
    );
    process.exit(1);
  }

  const modelId = process.env.CURSOR_GENERATE_COMMIT_MESSAGE_AI_MODEL;
  if (!modelId) {
    console.error(
      chalk.red(
        '[오류] CURSOR_GENERATE_COMMIT_MESSAGE_AI_MODEL 환경변수가 설정되어 있지 않습니다.',
      ),
    );
    process.exit(1);
  }

  // 1. Git 상태 및 변경사항 조회
  const gitStatus = getGitOutput('git status --porcelain');
  if (!gitStatus) {
    console.log(chalk.yellow('변경된 파일이 없습니다.'));
    return;
  }

  const stagedDiff = getGitOutput('git diff --staged');
  const unstagedDiff = getGitOutput('git diff');
  const fullDiff = stagedDiff
    ? `${stagedDiff}\n${unstagedDiff}`.trim()
    : unstagedDiff;

  // 2. 보안 가드레일: Diff 및 상태에 민감 정보가 포함되어 있는지 검사
  checkSecretLeak(gitStatus, fullDiff);

  // 3. 저장소의 최근 커밋 로그 조회
  const recentLogs = getGitOutput('git log -5 --oneline');

  // 4. 프로젝트 규칙과 Caveman Commit 스킬 규칙을 선택적으로 로드
  const rulesContent = loadSkillRules(
    '.cursor/skills/generate-commit-message/SKILL.md',
    '.agents/skills/caveman-commit/SKILL.md',
  );

  // 5. 프롬프트 구성
  const prompt = dedent`
    당신은 숙련된 소프트웨어 엔지니어로서 아래 전달된 지침 및 규칙 문서에 따라 Git 변경 사항에 대한 커밋 메시지를 작성해야 합니다.

    [지침 및 스킬 규칙]
    ${rulesContent}

    [핵심 요약 지침]
    - 언어: 반드시 한국어 (고유명사, 파일명 등은 원문 유지)
    - 형식: {prefix}: {요약} (허용 prefix: feat, fix, test, chore, dev)
    - 스타일: Caveman 스타일 적용 — 군더더기(Fluff) 100% 제거, 50자 내외의 극도로 간결한 제목, 필요한 경우에만 1~2문장의 Why 작성
    - 출력 형식: 마크다운 코드블록(\`\`\`) 없이 오직 커밋 메시지 원문 텍스트만 출력

    [최근 커밋 로그 참고]
    ${recentLogs || '(없음)'}

    [Git 상태]
    ${gitStatus}

    [Git Diff]
    ${fullDiff.slice(0, 8000)}
  `;

  console.log(
    chalk.blue(
      `Cursor SDK(${modelId})를 통해 커밋 메시지(규칙 + Caveman 스타일)를 생성하는 중...`,
    ),
  );

  try {
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: modelId },
    });

    if (result.status !== 'finished' || !result.result) {
      console.error(
        chalk.red(`[오류] 커밋 메시지 생성 실패 (상태: ${result.status})`),
      );
      process.exit(1);
    }

    const commitMessage = cleanMarkdownCodeFence(result.result);

    // 6. 결과 파일(.github/generated/commit-message.txt) 저장
    const outputPath =
      src.constants.paths.files.githubGeneratedCommitMessageFile;
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, `${commitMessage}\n`, 'utf-8');

    console.log(
      chalk.green(
        `\n✓ 커밋 메시지가 성공적으로 생성되었습니다: ${outputPath}\n`,
      ),
    );
    console.log(
      chalk.cyan('---------------- [생성된 커밋 메시지] ----------------'),
    );
    console.log(commitMessage);
    console.log(
      chalk.cyan('-----------------------------------------------------\n'),
    );
  } catch (error: any) {
    console.error(
      chalk.red(
        `[오류] Cursor SDK 호출 중 오류 발생: ${error.message || error}`,
      ),
    );
    process.exit(1);
  }
}

void generateCommitMessage();
