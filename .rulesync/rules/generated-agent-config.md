---
root: false
targets:
  - '*'
description: AI 에이전트 설정 SSOT는 .rulesync와 .projenrc.ts. .cursor/rules·skills·mcp.json, .claude/rules·skills, .mcp.json은 생성물이라 직접 수정 금지
globs: []
cursor:
  alwaysApply: true
  description: AI 에이전트 설정 SSOT는 .rulesync와 .projenrc.ts. .cursor/rules·skills·mcp.json, .claude/rules·skills, .mcp.json은 생성물이라 직접 수정 금지
  globs: []
---

# AI 에이전트 설정 SSOT (`.rulesync/`)

rules·skills·MCP의 SSOT는 `.rulesync/`와 `.projenrc.ts`다. 아래 경로는 `pnpm ai:generate`(rulesync, `delete: true`)가 만드는 **생성물**이며 gitignore 대상이다. 직접 고치거나 파일을 추가하면 다음 생성 때 **지워진다**.

| 생성물 | SSOT |
|---|---|
| `.cursor/rules/*.mdc`, `.claude/rules/*.md` | `.rulesync/rules/*.md` |
| `.cursor/skills/`, `.claude/skills/` | `.rulesync/skills/` (레포 전용은 실제 디렉토리, 범용은 `.agents/skills/` symlink) |
| `.cursor/mcp.json`, `.mcp.json` | `.projenrc.ts` → `.rulesync/mcp.jsonc` (projen 생성물, 직접 수정 금지) |

`.cursor/settings.json`(plugins)은 projen이 직접 쓰는 Cursor 전용 설정이다.

## 변경 절차

- rule·skill 추가·수정: `.rulesync/` 아래를 고친 뒤 `pnpm ai:generate`.
- always rule frontmatter: `globs: []` + `cursor.alwaysApply: true` + `cursor.globs: []`. `globs: ['**/*']`는 Claude Code에서 always가 아니다(파일 접근 시에만 로드).
- MCP 추가·수정: `.projenrc.ts`의 rulesync MCP 블록 → `pnpm projen`. Cursor는 `${workspaceFolder}`+`envFile`, Claude Code는 상대경로·컨테이너 env. `env` 값에 `${workspaceFolder}`를 쓰지 않는다(rulesync가 Cursor용으로 `${env:workspaceFolder}`로 바꾼다).
- 범용 skill 설치(`npx skills add …`) 후: `ln -s ../../.agents/skills/<name> .rulesync/skills/<name>` → `pnpm ai:generate`.
- 검증: `pnpm ai:check`(생성물 최신 여부), `pnpm ai:doctor`(소스 검증).
- rulesync 버전은 `26.0.0` 고정. 올리려면 별도 이슈로 진행.
