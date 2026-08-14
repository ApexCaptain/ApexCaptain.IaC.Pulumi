#!/usr/bin/env bash
# Coder workspace → Vault JWT login (non-blocking).
# Based on registry.coder.com/coder/vault-jwt run.sh with graceful failure.

set -euo pipefail

VAULT_CLI_VERSION="1.21.4"
VAULT_JWT_AUTH_PATH="${vault_jwt_auth_path}"
VAULT_JWT_ROLE="${vault_jwt_role}"
CODER_OIDC_ACCESS_TOKEN="${oidc_access_token}"

fetch() {
  dest="$1"
  url="$2"
  if command -v curl > /dev/null 2>&1; then
    curl -sSL --fail "$${url}" -o "$${dest}"
  elif command -v wget > /dev/null 2>&1; then
    wget -O "$${dest}" "$${url}"
  elif command -v busybox > /dev/null 2>&1; then
    busybox wget -O "$${dest}" "$${url}"
  else
    printf "curl, wget, or busybox is not installed. Please install curl or wget in your image.\n"
    exit 1
  fi
}

unzip_safe() {
  if command -v unzip > /dev/null 2>&1; then
    command unzip "$@"
  elif command -v busybox > /dev/null 2>&1; then
    busybox unzip "$@"
  else
    printf "unzip or busybox is not installed. Please install unzip in your image.\n"
    exit 1
  fi
}

install_vault_cli() {
  ARCH=$(uname -m)
  if [ "$${ARCH}" = "x86_64" ]; then
    ARCH="amd64"
  elif [ "$${ARCH}" = "aarch64" ]; then
    ARCH="arm64"
  else
    printf "Unsupported architecture: $${ARCH}\n"
    return 1
  fi

  if [ "$${VAULT_CLI_VERSION}" = "latest" ]; then
    LATEST_VERSION=$(curl -s https://releases.hashicorp.com/vault/ | grep -v 'rc' | grep -oE 'vault/[0-9]+\.[0-9]+\.[0-9]+' | sed 's/vault\///' | sort -V | tail -n 1)
    if [ -z "$${LATEST_VERSION}" ]; then
      printf "Failed to determine the latest Vault version.\n"
      return 1
    fi
    VAULT_CLI_VERSION=$${LATEST_VERSION}
  fi

  installation_needed=1
  if command -v vault > /dev/null 2>&1; then
    CURRENT_VERSION=$(vault version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
    if [ "$${CURRENT_VERSION}" = "$${VAULT_CLI_VERSION}" ]; then
      installation_needed=0
    fi
  fi

  if [ $${installation_needed} -eq 1 ]; then
    fetch vault.zip "https://releases.hashicorp.com/vault/$${VAULT_CLI_VERSION}/vault_$${VAULT_CLI_VERSION}_linux_$${ARCH}.zip"
    unzip_safe -o vault.zip
    rm -f vault.zip
    if sudo mv vault /usr/local/bin/vault 2> /dev/null; then
      :
    else
      mkdir -p ~/.local/bin
      mv vault ~/.local/bin/vault
      export PATH="$HOME/.local/bin:$PATH"
    fi
  fi
  return 0
}

TMP=$(mktemp -d)
if ! (
  cd "$TMP"
  install_vault_cli
); then
  echo "⚠️  Vault CLI install failed — skipping Vault login."
  rm -rf "$TMP"
  exit 0
fi
rm -rf "$TMP"

if [ -z "$${CODER_OIDC_ACCESS_TOKEN}" ]; then
  echo "⚠️  Vault login skipped (no OIDC access token)."
  exit 0
fi

printf "🔑 Authenticating with Vault ...\n\n"

set +e
echo "$${CODER_OIDC_ACCESS_TOKEN}" | vault write -field=token "auth/$${VAULT_JWT_AUTH_PATH}/login" role="$${VAULT_JWT_ROLE}" jwt=- | vault login -
rc=$?
set -e

if [ "$rc" -ne 0 ]; then
  echo "⚠️  Vault login skipped (no Vault access for this user or authentication failed)."
  exit 0
fi

printf "✅ Vault authentication complete.\n"
