---
root: false
targets:
  - '*'
description: '에디터 color theme 고르기·레포 고정. Open VSX 필수, projenrc·devcontainer·로컬 UI 확장'
globs:
  - '.projenrc.ts'
  - '.vscode/**'
  - '.devcontainer/devcontainer.json'
cursor:
  alwaysApply: false
  description: '에디터 color theme 고르기·레포 고정. Open VSX 필수, projenrc·devcontainer·로컬 UI 확장'
  globs:
    - '.projenrc.ts'
    - '.vscode/**'
    - '.devcontainer/devcontainer.json'
---

# 에디터 color theme (레포 고정)

워크스페이스 테마는 개인 User 설정이 아니라 **레포에 고정**한다. Cursor를 쓰므로 후보는 **Open VSX에 있는 것만** 고른다 (VS Marketplace 전용은 Cursor Extensions/devcontainer 자동 설치가 깨질 수 있음).

## 고르는 순서

1. 미리보기: [vscodethemes.com](https://www.vscodethemes.com/) (눈 호강). Open VSX 전용 예쁜 갤러리는 사실상 없음.
2. 존재 확인: `https://open-vsx.org/extension/{publisher}/{name}` 또는 API `https://open-vsx.org/api/{publisher}/{name}` → **200**이어야 함.
3. `workbench.colorTheme` 값은 확장 `package.json`의 `contributes.themes[].label` (displayName·마켓 제목 아님). VSIX/리포에서 확인.
4. 변형이 여러 개면 사용자에게 label 하나 정하게 한 뒤 고정.

## 레포에 적용 (SSOT)

| 무엇 | 어디 | 비고 |
|---|---|---|
| 테마 이름 | `.projenrc.ts` → `vsCode.settings` `workbench.colorTheme` | 생성물: `.vscode/settings.json` |
| 확장 추천 | `.projenrc.ts` → `vsCode.extensions.addRecommendations(...)` | 생성물: `.vscode/extensions.json` |
| Dev Container 확장 목록 | `.devcontainer/devcontainer.json` `customizations.vscode.extensions` | **projen 생성물 아님.** 손으로 맞춤 |

절차: `.projenrc.ts` 수정 → `pnpm exec projen` → `devcontainer.json` 확장 ID 동기화. `.vscode/*` 직접 수정 금지.

## 설치 위치 (헷갈리기 쉬운 점)

- color theme은 **UI 확장**이다. 렌더는 **클라이언트 PC의 Cursor/VS Code**에서 한다. SSH·Dev Container 안이 아님.
- `devcontainer.json`에 넣는 이유는 “워크스페이스 열 때 클라이언트가 로컬에 설치” 힌트용이다. 컨테이너 이미지에 테마를 심는 설정이 아니다.
- 확장만 로컬에 설치하면 Rebuild 없이 창 리로드로도 적용된다. Rebuild만으로 테마가 “컨테이너에 생기지”는 않는다.

## Cursor vs VS Code

- `.vscode/settings.json`의 `colorTheme` 이름은 같은 폴더를 열면 둘 다 씀.
- 확장 설치·User 설정·Settings Sync는 **앱별로 따로**. Cursor = Open VSX, VS Code = Marketplace.
- Open VSX에 없는 테마는 VS Code만 쓰거나 VSIX 수동 설치.

## 현재 값 (2026-11)

| 항목 | 값 |
|---|---|
| 확장 ID | `bpat86.nightcall` |
| `workbench.colorTheme` | `Nightcall` (기본 변형) |

바꿀 때 위 표와 `.projenrc.ts` / `devcontainer.json`을 같이 갱신한다.
