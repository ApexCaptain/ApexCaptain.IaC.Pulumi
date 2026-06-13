#!/usr/bin/env bash

echo "🔄 Changing directory ownership for $DIR_PATHS_TO_CHANGE_OWNER to $USER"
sudo chown -R $USER:$USER $DIR_PATHS_TO_CHANGE_OWNER
echo "✅ Changed directory ownership for $DIR_PATHS_TO_CHANGE_OWNER to $USER"

echo "🔄 Updating apt packages"
sudo apt update -y
sudo apt upgrade -y
echo "✅ Updated apt packages"

echo "🔄 Installing apt packages"
sudo apt install -y \
    netcat-openbsd \
    iputils-ping \
    parallel \
    ripgrep
echo "✅ Apt packages installed"

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

# Parallel Installations
install_oci() {
    echo "🔄 Installing OCI CLI"
    bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)" -- --accept-all-defaults
    echo "✅ OCI CLI installed"
}

install_helm() {
    echo "🔄 Installing Helm CLI"
    bash -c "$(curl -L https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3)"
    echo "✅ Helm CLI installed"
}

install_pnpm() {
    echo "🔄 Installing pnpm"
    corepack enable pnpm
    corepack prepare pnpm@latest --activate
    echo "✅ pnpm installed"
}

install_nova() {
    echo "🔄 Installing Fairwinds Nova"
    asdf plugin-add nova
    asdf install nova latest
    asdf global nova 3.12.0
    echo "✅ Fairwinds Nova installed"
}

export -f install_oci install_helm install_pnpm install_nova
parallel --jobs 10 ::: install_oci install_helm install_pnpm install_nova

./.devcontainer/commands/common/synchronizeProject.sh