#!/usr/bin/env bash

echo "🔄 Setup GitHub"
gh auth setup-git

echo "🔄 Pull latest changes"
git pull

./.devcontainer/commands/common/synchronizeProject.sh

./.devcontainer/commands/common/startClaudeRemoteControl.sh