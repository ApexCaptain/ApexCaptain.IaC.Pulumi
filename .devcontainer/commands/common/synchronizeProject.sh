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

echo "Approve pnpm builds"
pnpm approve-builds --all
echo "✅ Approved pnpm builds"

echo "🔄 Installing dependencies"
pnpm i -w --config.confirmModulesPurge=false --no-frozen-lockfile
echo "✅ Installed dependencies"


echo "🔄 Initializing Projen"
pnpm projen
echo "✅ Initialized Projen"

echo "✅ Synchronization completed"