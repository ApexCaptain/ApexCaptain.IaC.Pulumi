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
 * PR 비교 기준(Base)이 되는 브랜치를 결정합니다.
 * 1. CLI 인자(argv[2]) 또는 환경변수(PR_BASE_BRANCH)
 * 2. origin/main -> main -> origin/develop -> develop 순서로 폴백
 */
function determineBaseBranch(): string {
  const customBase = process.argv[2] || process.env.PR_BASE_BRANCH;
  if (customBase) return customBase;

  const hasOriginMain = getGitOutput('git rev-parse --verify origin/main');
  if (hasOriginMain) return 'origin/main';

  const hasMain = getGitOutput('git rev-parse --verify main');
  if (hasMain) return 'main';

  const hasOriginDevelop = getGitOutput(
    'git rev-parse --verify origin/develop',
  );
  if (hasOriginDevelop) return 'origin/develop';

  const hasDevelop = getGitOutput('git rev-parse --verify develop');
  if (hasDevelop) return 'develop';

  return 'main';
}

/**
 * Base 브랜치 대비 현재 브랜치의 전체 변경 사항을 검토하고,
 * PR 생성 규칙 및 템플릿을 선택적으로 로드하여 Cursor SDK로 PR Title/Body를 생성한 뒤 파일로 저장합니다.
 */
async function generatePullRequest(): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error(
      chalk.red('[오류] CURSOR_API_KEY 환경변수가 설정되어 있지 않습니다.'),
    );
    process.exit(1);
  }

  const modelId = process.env.CURSOR_GENERATE_PULL_REQUEST_AI_MODEL;
  if (!modelId) {
    console.error(
      chalk.red(
        '[오류] CURSOR_GENERATE_PULL_REQUEST_AI_MODEL 환경변수가 설정되어 있지 않습니다.',
      ),
    );
    process.exit(1);
  }

  // 1. Base 브랜치 결정 및 PR 대상 커밋/Diff 조회
  const baseBranch = determineBaseBranch();
  console.log(chalk.gray(`PR Base 브랜치: ${baseBranch}`));

  const prCommits = getGitOutput(`git log ${baseBranch}..HEAD --oneline`);
  const prDiff = getGitOutput(`git diff ${baseBranch}...HEAD`);
  const gitStatus = getGitOutput('git status --porcelain');

  if (!prCommits && !prDiff && !gitStatus) {
    console.log(
      chalk.yellow(`Base 브랜치(${baseBranch}) 대비 변경 사항이 없습니다.`),
    );
    return;
  }

  // 2. 보안 가드레일: Diff 및 작업 트리 내 민감 정보 누출 여부 검사
  checkSecretLeak(gitStatus, prDiff);

  // 3. PR 스킬 규칙 문서 및 템플릿 선택적 로드
  const rulesContent = loadSkillRules(
    '.cursor/skills/generate-pull-request/SKILL.md',
  );

  const templatePath = path.join(
    process.cwd(),
    '.github/pull_request_template.md',
  );
  const templateContent = fs.existsSync(templatePath)
    ? fs.readFileSync(templatePath, 'utf-8')
    : '';

  // 4. 프롬프트 구성
  const prompt = dedent`
    당신은 숙련된 소프트웨어 엔지니어로서 아래 전달된 지침 문서와 템플릿에 따라 GitHub PR 제목(Title)과 본문(Body)을 작성해야 합니다.

    [지침 및 스킬 규칙]
    ${rulesContent}

    [PR 템플릿 참조]
    ${templateContent}

    [핵심 요약 지침]
    1. 언어: 반드시 한국어 (고유명사, CLI 명령어, 경로는 원문 유지)
    2. PR Title: 반드시 "{prefix}: {요약}" 형태의 단일 줄 (허용 prefix: feat, fix, test, chore, dev)
    3. PR Body:
       - 템플릿의 섹션 구조를 따르되 HTML 주석은 모두 제거
       - 내용 없는 섹션은 N/A 등을 넣지 말고 섹션 헤더(## ...) 전체를 완전히 삭제
       - Checklist는 확인된 항목만 [x] 표기
    4. 출력 형식:
       아래의 JSON 형식으로만 응답하세요. 마크다운 코드블록(\`\`\`json)으로 감싸지 마세요.
       {
         "title": "prefix: PR 제목 요약",
         "body": "## Summary\\n\\n- 주요 변경 내용\\n\\n## Test plan\\n\\n- [ ] 검증 계획\\n\\n## Checklist\\n\\n- [x] Self-review 완료..."
       }

    [브랜치 커밋 목록 (${baseBranch}..HEAD)]
    ${prCommits || '(커밋 없음, 작업 트리 변경사항 참조)'}

    [작업 트리 상태]
    ${gitStatus || '(깨끗함)'}

    [PR 전체 Diff]
    ${(prDiff || getGitOutput('git diff HEAD')).slice(0, 10000)}
  `;

  console.log(
    chalk.blue(
      `Cursor SDK(${modelId})를 통해 PR Title 및 Body를 생성하는 중...`,
    ),
  );

  try {
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: modelId },
    });

    if (result.status !== 'finished' || !result.result) {
      console.error(
        chalk.red(`[오류] PR 정보 생성 실패 (상태: ${result.status})`),
      );
      process.exit(1);
    }

    const rawOutput = cleanMarkdownCodeFence(result.result, 'json');

    // 5. JSON 파싱 및 Fallback 처리
    let parsed: { title: string; body: string };
    try {
      parsed = JSON.parse(rawOutput);
    } catch {
      console.warn(chalk.yellow('[알림] JSON 파싱 실패, 텍스트 분리 시도'));
      const firstLineBreak = rawOutput.indexOf('\n');
      if (firstLineBreak > 0) {
        parsed = {
          title: rawOutput.slice(0, firstLineBreak).trim(),
          body: rawOutput.slice(firstLineBreak).trim(),
        };
      } else {
        parsed = {
          title: rawOutput,
          body: rawOutput,
        };
      }
    }

    // 6. 결과 파일 분리 저장 (.github/generated/pull-request-title.txt & pull-request-body.md)
    const titleFile =
      src.constants.paths.files.githubGeneratedPullRequestTitleFile;
    const bodyFile =
      src.constants.paths.files.githubGeneratedPullRequestBodyFile;
    const outputDir = src.constants.paths.dirs.githubGeneratedDir;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(titleFile, `${parsed.title.trim()}\n`, 'utf-8');
    fs.writeFileSync(bodyFile, `${parsed.body.trim()}\n`, 'utf-8');

    console.log(
      chalk.green(`\n✓ PR Title 및 Body가 성공적으로 생성되었습니다:`),
    );
    console.log(chalk.green(`  - Title: ${titleFile}`));
    console.log(chalk.green(`  - Body:  ${bodyFile}\n`));

    console.log(
      chalk.cyan('-------------------- [PR Title] --------------------'),
    );
    console.log(parsed.title.trim());
    console.log(
      chalk.cyan('--------------------- [PR Body] --------------------'),
    );
    console.log(parsed.body.trim());
    console.log(
      chalk.cyan('----------------------------------------------------\n'),
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

void generatePullRequest();
