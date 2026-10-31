#!/usr/bin/env bash

./.devcontainer/commands/common/linkSecrets.sh

echo "🔄 Setup GitHub"
gh auth setup-git

echo "🔄 Pull latest changes"
git pull

./.devcontainer/commands/common/synchronizeProject.sh

./.devcontainer/commands/common/startClaudeRemoteControl.sh