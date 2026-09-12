import { loadSkillRules } from './skills';

const SHARED_PROMPT_RULES = [
  'scripts/prompts/shared/language-and-style.md',
  'scripts/prompts/shared/prefixes.md',
  'scripts/prompts/shared/anti-fluff.md',
] as const;

const GENERATION_PROMPT_RULES = {
  'commit-message': 'scripts/prompts/commit-message/rules.md',
  'pull-request': 'scripts/prompts/pull-request/rules.md',
  'branch-name': 'scripts/prompts/branch-name/rules.md',
} as const;

export type GenerationPromptTask = keyof typeof GENERATION_PROMPT_RULES;

/**
 * Git 생성 스크립트(commit-message, pull-request)용 공통·작업별 프롬프트 규칙을 로드합니다.
 */
export function loadGenerationRules(task: GenerationPromptTask): string {
  return loadSkillRules(...SHARED_PROMPT_RULES, GENERATION_PROMPT_RULES[task]);
}
