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