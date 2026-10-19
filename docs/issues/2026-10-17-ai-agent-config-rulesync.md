# AI 에이전트 설정 SSOT (rulesync) — Cursor·Claude Code 공용화

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-17 |
| **영역** | `.cursor/`, `.agents/skills/`, `.projenrc.ts` (MCP·Cursor 설정), `src/constants.ts`, `src/interfaces/`, `scripts/`, `projenrc/workflows/pr-validation.ts` |
| **관련 문서** | [설계 스펙](../superpowers/specs/2026-10-17-ai-agent-config-rulesync-design.md), [구현 플랜](../superpowers/plans/2026-10-17-ai-agent-config-rulesync.md) |
| **상태** | **적용** — 마이그레이션·검증 완료. 후속(버전 재검토·중립화 등)은 아래·schedule |

## 배경

레포는 Cursor 기준으로 만들어졌다. rules 7개(`.cursor/rules/*.mdc`), 레포 전용 skills 3개(`.cursor/skills/`), MCP 5개(`.cursor/mcp.json`, projen 생성)는 Cursor 전용 경로·문법에 묶여 있다. 범용 skills 13개는 `.agents/skills/`(`skills-lock.json`)에 있다. Claude Code(devcontainer에 이미 설치돼 있음)는 이 설정들을 하나도 읽지 못한다.

## 결정 (2026-10-17)

- 생성 엔진: **rulesync `26.0.0` 정확 고정**. 사유: 2주 사이 메이저 26 → 36 (10-02 ~ 10-16).
- SSOT: `.rulesync/` (도구 기본값). rules·skills는 수동 markdown, MCP와 `rulesync.jsonc`는 projen JsonFile.
- 대상: Cursor, Claude Code. Codex 등은 확장 지점만 둔다.
- 생성물은 **gitignore**. `postprojen`(`pnpm projen`)에서 생성한다.
- `.cursor/settings.json`(plugins)은 Cursor 전용 override로 projen이 계속 소유한다.
- rule 본문은 최소한만 수정한다. 중립화는 후속 작업.
- `AGENTS.md`: turbo 자동 삽입을 끄고(`.projenrc.ts` → `turbo.json` `agentGuidance: false`), 같은 안내는 rule `use-installed-turbo-docs`로 옮긴다. rulesync로 `AGENTS.md`를 생성할지는 Codex 후속에서 정한다.

## 실측 근거 (rulesync 26.0.0, scratch sandbox)

| # | 결과 |
|---|---|
| 1 | `import --targets cursor`: rules 7 + skills 3 무손실. 재생성한 `.mdc`는 frontmatter key 순서만 다르다 |
| 2 | import된 `globs: ['**/*']`는 Claude에서 `paths: ['**/*']`가 되어 **always가 아니다**. `globs: []`로 바꾸면 Claude는 frontmatter 없는 always rule, Cursor는 그대로 |
| 3 | MCP의 `${workspaceFolder}`·`envFile`이 Claude `.mcp.json`에 그대로 복사된다(무효). `claudecode.mcpServers` 블록으로 override 가능 |
| 4 | Cursor `env` 값의 `${workspaceFolder}`가 `${env:workspaceFolder}`로 바뀐다(OCI MCP 깨짐). `args`는 바뀌지 않는다 → `scripts/mcp-oci.sh` 래퍼로 해결 |
| 5 | `delete: true`는 `.cursor/rules`, `.cursor/skills`, `.claude/rules`, `.claude/skills`의 비관리 파일을 지운다. `.cursor/settings.json`, `.agents/skills`는 유지 |
| 6 | `.rulesync/skills/<x>` → `../../.agents/skills/<x>` symlink를 두면 Cursor·Claude 양쪽에 복사된다 |
| 7 | `rulesync.jsonc`에 `"//"` 키가 있으면 `doctor`가 error를 낸다. `.jsonc` JsonFile은 projen marker를 주석으로 쓴다 |
| 8 | 비밀 값(`CONTEXT7_API_KEY` 등)은 docker-compose `env_file`로 컨테이너 env에 이미 있다 → Claude는 envFile 불필요 |
| 9 | `agentsmd` 타깃 `["rules"]`: `AGENTS.md`(root 본문 + 나머지 rule 경로 목록) + `.agents/memories/*.md` 생성. root rule이 있으면 claudecode가 `CLAUDE.md`도 생성. `.agents/skills`는 유지 |
| 10 | `agentsmd`의 skills 출력 경로가 `.agents/skills`라 `delete: true`와 함께 켜면 `skills-lock.json` 관리 skill과 충돌 위험. rules만 켤 것 |

## 수용 기준

- [x] `.rulesync/`가 rules·skills의 유일한 수동 편집 위치이고, MCP는 `.projenrc.ts`에서만 정의된다
- [x] `pnpm projen` 한 번으로 Cursor·Claude 설정이 생성되고, `pnpm ai:check`가 exit 0
- [x] Cursor `.mdc`가 baseline과 의미상 동일하다(검증 스크립트 OK). 예외는 `use-matching-skills` 본문 수정과 신규 `generated-agent-config`·`use-installed-turbo-docs`
- [x] MCP probe: `.cursor/mcp.json --cursor`와 `.mcp.json` 모두 5/5 OK
- [x] Claude Code에서 rules 8개 always 로드, skills 16개, MCP 5개 연결 (`claude mcp list`, `skills list`, rebuild 후 확인)
- [x] Cursor: rule 8·skill 16·MCP 5 (`alwaysApply`, probe, K8s/OCI/Pulumi 실호출). Settings skill 중복 표시는 미관측(동작 문제 없음)
- [x] PR Validate에 `pnpm ai:doctor` 단계가 있다
- [x] turbo 실행 후 `AGENTS.md`가 다시 생기지 않는다 (`agentGuidance: false`)

## 후속 (범위 밖)

- rulesync 버전 업그레이드 재검토 (`docs/schedule.md`)
- rule 본문 에이전트 중립화 (Cursor 전용 표현, SpecStory rule `targets`)
- Codex 타깃 추가 (`codexcli`): `AGENTS.md`, `.codex/config.toml`. `codexcli`·`agentsmd` 중 하나만 rules로 켜고, `AGENTS.md`·`.agents/memories/`·`CLAUDE.md` gitignore, Cursor·Claude의 `AGENTS.md` 중복 로드 실측 (실측 #9·#10)
- `.claude/settings.json` permissions·hooks를 rulesync `permissions`/`hooks`로 관리
- 검증 스크립트(`mcp-probe`)를 `scripts/`에 정식 편입할지 결정
- Cursor Settings에서 `.agents`·`.cursor` skill 중복 표시 여부 확인 후 필요 시 정리

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-17 | 실측·설계·플랜 작성. 실행 대기. schedule에 2026-11 초 버전 재검토 행 추가 |
| 2026-10-17 | 리뷰: 플랜 Task 1 `depsUpgradeOptions`는 기존 객체에 `exclude`만 merge하도록 수정. 타임라인 추가 |
| 2026-10-17 | `feat/ai-agent-config-rulesync`에서 플랜 Task 0~7 적용. 자동 검증 통과 |
| 2026-10-17 | rebuild 후 Task 8 검증(MCP·rules·skills). 수용 기준 충족, **적용** 상태로 정리 |
| 2026-10-17 | turbo가 만든 untracked `AGENTS.md` 발견. `agentGuidance: false` + rule `use-installed-turbo-docs` 추가(rules 9개), `AGENTS.md` 삭제. `pnpm projen` 후 재생성 없음, `ai:check`·`ai:doctor` OK |
