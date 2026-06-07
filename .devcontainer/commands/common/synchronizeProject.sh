#!/usr/bin/env bash

echo "🔄 Starting synchronization"

if [ "$ENABLE_AUTO_SYNC" = false ]; then
    echo "⏩ Auto sync skipped"
    exit 0
fi

echo "🔄 Setting up aliases"
BASHRC_FILE="$HOME/.bashrc"
touch "$BASHRC_FILE"
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