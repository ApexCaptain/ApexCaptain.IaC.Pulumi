#!/usr/bin/env bash
# PR 검증용 워크스페이스 build.
# 루트/설정이 바뀌면 전량(build:workspaces), 아니면 turbo --affected 로 좁힌다.
# 필요 env: TURBO_SCM_BASE (PR base SHA). TURBO_SCM_HEAD 기본 HEAD.
set -euo pipefail

BASE="${TURBO_SCM_BASE:?TURBO_SCM_BASE (PR base SHA) required}"
HEAD="${TURBO_SCM_HEAD:-HEAD}"

ROOT_PATTERN='^(\.projenrc\.ts|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json|package\.json|projenrc/|\.github/workflows/|scripts/)'

# shallow 체크아웃에서도 base 객체를 확보
if ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  echo "Fetching missing base commit ${BASE}"
  git fetch --no-tags --prune origin "${BASE}"
fi

CHANGED="$(git diff --name-only "${BASE}...${HEAD}" || true)"
if [[ -z "${CHANGED}" ]]; then
  echo "No file diff vs ${BASE}...${HEAD} — skipping package build (root eslint/scripts still run)."
  exit 0
fi

if printf '%s\n' "${CHANGED}" | grep -qE "${ROOT_PATTERN}"; then
  echo "Root/config change detected — full pnpm build:workspaces"
  printf '%s\n' "${CHANGED}" | grep -E "${ROOT_PATTERN}" || true
  pnpm build:workspaces
  exit 0
fi

echo "Scoped turbo build --affected (${BASE}...${HEAD})"
export TURBO_SCM_BASE="${BASE}"
export TURBO_SCM_HEAD="${HEAD}"
pnpm exec turbo run build \
  --affected \
  --filter="./common/*" \
  --filter="./infra/*"
