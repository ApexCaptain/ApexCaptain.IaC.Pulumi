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
    ripgrep \
    sshpass
echo "✅ Apt packages installed"

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
    asdf global nova ${NOVA_VERSION}
    echo "✅ Fairwinds Nova installed"
}

install_istioctl() {
    echo "🔄 Installing istioctl ${ISTIOCTL_VERSION}"
    curl -fsSL "https://github.com/istio/istio/releases/download/${ISTIOCTL_VERSION}/istioctl-${ISTIOCTL_VERSION}-linux-amd64.tar.gz" \
        | sudo tar -xz -C /usr/local/bin istioctl
    echo "✅ istioctl ${ISTIOCTL_VERSION} installed"
}

export -f install_oci install_helm install_pnpm install_nova install_istioctl
parallel --jobs 10 ::: install_oci install_helm install_pnpm install_nova install_istioctl

./.devcontainer/commands/common/synchronizeProject.sh