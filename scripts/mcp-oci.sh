#!/usr/bin/env bash
# OCI MCP launcher. OCI_CONFIG_FILE is resolved from the repo root here instead
# of in the MCP config, because rulesync rewrites ${workspaceFolder} inside
# Cursor env values to ${env:workspaceFolder} (unresolvable).
#
# Usage: mcp-oci.sh <oci-config-file-relative-to-repo-root> <oci-profile>
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${1:?usage: mcp-oci.sh <oci-config-file> <oci-profile>}"
PROFILE="${2:?usage: mcp-oci.sh <oci-config-file> <oci-profile>}"

export OCI_CONFIG_FILE="${REPO_ROOT}/${CONFIG_FILE}"
export OCI_CONFIG_PROFILE="${PROFILE}"
export FASTMCP_LOG_LEVEL="${FASTMCP_LOG_LEVEL:-ERROR}"

exec uvx oracle.oci-cloud-mcp-server@latest
