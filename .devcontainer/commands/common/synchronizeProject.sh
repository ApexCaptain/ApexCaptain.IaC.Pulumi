#!/usr/bin/env bash

echo "🔄 Starting synchronization"

if [ "$ENABLE_AUTO_SYNC" = false ]; then
    echo "⏩ Auto sync skipped"
    exit 0
fi

BASHRC_FILE="$HOME/.bashrc"
touch "$BASHRC_FILE"

echo "🔄 Setting up aliases"
sed -i \
    -e '/^alias k=kubectl$/d' \
    -e '/^alias h=helm$/d' \
    -e '/^alias d=docker$/d' \
    "$BASHRC_FILE"
{
    echo "alias k=kubectl"
    echo "alias h=helm"
    echo "alias d=docker"
} >> "$BASHRC_FILE"
echo "✅ Aliases set up"

echo "🔄 Setting up terminal colors for TUI skins"
sed -i \
    -e '/^# BEGIN TERM_COLORS$/,/^# END TERM_COLORS$/d' \
    "$BASHRC_FILE"
{
    echo "# BEGIN TERM_COLORS"
    echo "# k9s skins use hex colors; plain 'xterm' collapses them to the 16-color stock look."
    echo "if [ \"\${TERM}\" = \"xterm\" ] || [ \"\${TERM}\" = \"dumb\" ]; then"
    echo "  export TERM=xterm-256color"
    echo "fi"
    echo "if [ -z \"\${COLORTERM}\" ]; then"
    echo "  export COLORTERM=truecolor"
    echo "fi"
    echo "# END TERM_COLORS"
} >> "$BASHRC_FILE"
echo "✅ Terminal colors set up"

echo "🔄 Syncing k9s skins"
K9S_DIR=".devcontainer/data/workspace/k9s"
K9S_SKINS_SRC="${K9S_DIR}/skins"
K9S_SKINS_DST="${HOME}/.config/k9s/skins"
K9S_CONFIG="${HOME}/.config/k9s/config.yaml"
K9S_SKIN_FILE="${K9S_DIR}/skin"
# Project skin file is the source of truth (overrides stale container env).
if [ -f "$K9S_SKIN_FILE" ]; then
    K9S_SKIN="$(tr -d '[:space:]' < "$K9S_SKIN_FILE")"
fi
if [ -d "$K9S_SKINS_SRC" ] && [ -n "$(ls -A "$K9S_SKINS_SRC"/*.yaml 2>/dev/null)" ]; then
    mkdir -p "$K9S_SKINS_DST"
    cp -f "$K9S_SKINS_SRC"/*.yaml "$K9S_SKINS_DST/"
    echo "✅ Synced k9s skins to $K9S_SKINS_DST"
else
    echo "⏩ No k9s skins found under $K9S_SKINS_SRC"
fi
if [ -n "${K9S_SKIN:-}" ]; then
    mkdir -p "${HOME}/.config/k9s"
    if [ ! -f "$K9S_CONFIG" ]; then
        printf 'k9s:\n  ui:\n    skin: %s\n' "$K9S_SKIN" > "$K9S_CONFIG"
    else
        K9S_SKIN="$K9S_SKIN" K9S_CONFIG="$K9S_CONFIG" python3 - <<'PY'
import os
import re
from pathlib import Path

skin = os.environ["K9S_SKIN"]
path = Path(os.environ["K9S_CONFIG"])
text = path.read_text()
if re.search(r"(?m)^\s*skin:\s*", text):
    text = re.sub(r"(?m)^(\s*)skin:\s*.*$", rf"\1skin: {skin}", text, count=1)
elif re.search(r"(?m)^  ui:\s*$", text):
    text = re.sub(r"(?m)^  ui:\s*$", f"  ui:\n    skin: {skin}", text, count=1)
else:
    text = re.sub(r"(?m)^k9s:\s*$", f"k9s:\n  ui:\n    skin: {skin}", text, count=1)
path.write_text(text)
PY
    fi
    sed -i \
        -e '/^# BEGIN K9S_SKIN$/,/^# END K9S_SKIN$/d' \
        "$BASHRC_FILE"
    {
        echo "# BEGIN K9S_SKIN"
        echo "export K9S_SKIN=${K9S_SKIN}"
        echo "# END K9S_SKIN"
    } >> "$BASHRC_FILE"
    echo "✅ Set k9s skin to ${K9S_SKIN} (config.yaml + ~/.bashrc)"
else
    echo "⏩ K9S_SKIN unset; skipped config.yaml skin update"
fi

echo "🔄 Setup python3 venv"
# venv 설정
python3 -m venv $VIRTUAL_ENV_DIR_NAME
# 현재 세션에 venv 활성화
source ${VIRTUAL_ENV_DIR_PATH}/bin/activate
# bashrc에 venv 활성화 명령어 추가
sed -i \
    -e '/^# BEGIN PYTHON_VENV$/,/^# END PYTHON_VENV$/d' \
    "$BASHRC_FILE"
{
    echo "# BEGIN PYTHON_VENV"
    echo "if [ -f \"${VIRTUAL_ENV_DIR_PATH}/bin/activate\" ]; then"
    echo "  source \"${VIRTUAL_ENV_DIR_PATH}/bin/activate\""
    echo "fi"
    echo "# END PYTHON_VENV"
} >> "$BASHRC_FILE"
echo "✅ Setup python3 venv"

echo "🔄 Installing dependencies"
pnpm i --no-frozen-lockfile
echo "✅ Installed dependencies"

echo "🔄 Building projects"
pnpm build:workspaces
echo "✅ Built projects"

echo "🔄 Initializing Projen"
pnpm projen
echo "✅ Initialized Projen"

echo "🔄 Installing Husky"
npx -y husky
echo "✅ Initialized Husky"

echo "✅ Synchronization completed"