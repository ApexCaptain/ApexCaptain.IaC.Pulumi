/**
 * Cursor SDK `Agent.prompt` 기본값은 로컬 에이전트 + 셸/편집 도구다.
 * 생성 스크립트는 프롬프트만으로 텍스트를 받아야 하므로 도구를 끈다.
 */
export function cursorTextOnlyPromptOptions(apiKey: string, modelId: string) {
  return {
    apiKey,
    model: { id: modelId },
    tools: [] as [],
    local: {
      cwd: process.cwd(),
      settingSources: [] as [],
    },
  };
}
