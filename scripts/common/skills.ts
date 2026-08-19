import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

/**
 * 주어진 Skill 및 Rule 파일 경로들(.md, .mdc 등)에서 마크다운 내용을 읽어옵니다.
 * - 파일이 존재하지 않는 경우 콘솔에 경고를 출력합니다.
 * - YAML Frontmatter(--- ... ---)를 자동으로 제거하고, LLM 프롬프트에 주입하기 좋은 형식으로 결합합니다.
 */
export function loadSkillRules(...filePaths: string[]): string {
  const contents: string[] = [];

  for (const relativePath of filePaths) {
    const absolutePath = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(process.cwd(), relativePath);

    if (!fs.existsSync(absolutePath)) {
      console.warn(
        chalk.yellow(`[경고] 스킬/룰 파일을 찾을 수 없습니다: ${relativePath}`),
      );
      continue;
    }

    let fileContent = fs.readFileSync(absolutePath, 'utf-8').trim();

    // YAML frontmatter 제거
    if (fileContent.startsWith('---')) {
      fileContent = fileContent.replace(/^---[\s\S]*?\n---\n*/, '').trim();
    }

    if (fileContent) {
      const fileName = path.basename(relativePath);
      contents.push(`### [Rule/Skill: ${fileName}]\n${fileContent}`);
    }
  }

  return contents.join('\n\n');
}
