import fs from 'node:fs';
import path from 'node:path';
import { Agent } from '@cursor/sdk';
import chalk from 'chalk';
import dedent from 'dedent';
import * as src from '../src';
import {
  checkSecretLeak,
  cleanMarkdownCodeFence,
  getCombinedDiffStat,
  getGitOutput,
  loadGenerationRules,
  parseChangedFilesFromStatus,
  prepareDiffForPrompt,
} from './common';

/**
 * Git Staged 및 Unstaged 변경 사항을 분석하고,
 * scripts/prompts/ 규칙을 로드하여 Cursor SDK로 커밋 메시지를 생성한 뒤
 * .github/generated/commit-message.txt에 저장합니다.
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

  // 3. 저장소의 최근 커밋 로그 및 변경 요약 조회
  const recentLogs = getGitOutput('git log -5 --oneline');
  const diffStat = getCombinedDiffStat();
  const changedFiles = parseChangedFilesFromStatus(gitStatus);
  const preparedDiff = prepareDiffForPrompt(fullDiff);

  // 4. 공통·커밋 전용 프롬프트 규칙 로드
  const rulesContent = loadGenerationRules('commit-message');

  const diffContextNotes = [
    preparedDiff.diffExcludedFiles.length > 0
      ? `- diff 본문 제외 경로(파일명·stat만 참고): ${preparedDiff.diffExcludedFiles.join(', ')}`
      : null,
    preparedDiff.truncated
      ? '- 아래 [Git Diff]는 토큰 제한으로 일부 파일이 생략되었거나 축약되었습니다. [Git Diff Stat]과 [변경 파일 목록]을 반드시 함께 참고하세요.'
      : null,
    preparedDiff.abbreviatedFiles.length > 0
      ? `- 축약된 파일: ${preparedDiff.abbreviatedFiles.join(', ')}`
      : null,
    preparedDiff.omittedFiles.length > 0
      ? `- 생략된 파일: ${preparedDiff.omittedFiles.join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  // 5. 프롬프트 구성
  const prompt = dedent`
    당신은 숙련된 소프트웨어 엔지니어로서 아래 전달된 지침 및 규칙 문서에 따라 Git 변경 사항에 대한 커밋 메시지를 작성해야 합니다.

    [지침 및 규칙]
    ${rulesContent}

    [최근 커밋 로그 참고]
    ${recentLogs || '(없음)'}

    [Git 상태]
    ${gitStatus}

    [변경 파일 목록]
    ${changedFiles.map(file => `- ${file}`).join('\n') || '(없음)'}

    [Git Diff Stat]
    ${diffStat || '(없음)'}
    ${diffContextNotes ? `\n[Diff 컨텍스트 참고]\n${diffContextNotes}` : ''}

    [Git Diff]
    ${preparedDiff.diffExcerpt || '(없음)'}
  `;

  console.log(
    chalk.blue(`Cursor SDK(${modelId})를 통해 커밋 메시지를 생성하는 중...`),
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
