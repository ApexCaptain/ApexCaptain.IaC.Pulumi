#!/usr/bin/env bash
# Stdio bridge for remote MCP servers when Cursor resolves ${env:} from the
# local host instead of the Dev Container. Reads secrets from the container
# process environment (or envFile) and forwards them as headers via mcp-remote.
#
# Usage (single header — legacy):
#   mcp-remote-proxy.sh <url> <header-name> <env-var-name> [raw|bearer]
#
# Usage (multiple headers):
#   mcp-remote-proxy.sh <url> \
#     --header <header-name> <env-var-name> [raw|bearer] \
#     [--header <header-name> <env-var-name> [raw|bearer] ...]
#
#   raw    (default) — header value is the env var as-is
#   bearer — header value is "Bearer <env var>"
set -euo pipefail

URL="${1:?usage: mcp-remote-proxy.sh <url> ...}"
shift

header_args=()
header_index=0

resolve_value() {
  local env_name="$1"
  local mode="$2"
  if [[ -z "${!env_name:-}" ]]; then
    echo "mcp-remote-proxy: required environment variable ${env_name} is unset or empty" >&2
    exit 1
  fi
  case "${mode}" in
    raw) printf '%s' "${!env_name}" ;;
    bearer) printf 'Bearer %s' "${!env_name}" ;;
    *)
      echo "mcp-remote-proxy: unknown mode '${mode}' (expected raw|bearer)" >&2
      exit 1
      ;;
  esac
}

append_header() {
  local header_name="$1"
  local env_name="$2"
  local mode="${3:-raw}"
  local value
  value="$(resolve_value "${env_name}" "${mode}")"
  local export_name="MCP_PROXY_H_${header_index}"
  # Dynamically export so mcp-remote can expand ${MCP_PROXY_H_N} in --header.
  export "${export_name}=${value}"
  # Cursor mangling: no spaces around ':' in the header argument.
  header_args+=(--header "${header_name}:\${${export_name}}")
  header_index=$((header_index + 1))
}

if [[ "${1:-}" == "--header" ]]; then
  while [[ $# -gt 0 ]]; do
    if [[ "$1" != "--header" ]]; then
      echo "mcp-remote-proxy: expected --header, got '$1'" >&2
      exit 1
    fi
    shift
    local_header_name="${1:?--header requires <header-name>}"
    local_env_name="${2:?--header requires <env-var-name>}"
    shift 2
    local_mode="raw"
    if [[ "${1:-}" == "raw" || "${1:-}" == "bearer" ]]; then
      local_mode="$1"
      shift
    fi
    append_header "${local_header_name}" "${local_env_name}" "${local_mode}"
  done
else
  HEADER_NAME="${1:?header name required}"
  ENV_NAME="${2:?env var name required}"
  MODE="${3:-raw}"
  append_header "${HEADER_NAME}" "${ENV_NAME}" "${MODE}"
fi

if [[ ${#header_args[@]} -eq 0 ]]; then
  echo "mcp-remote-proxy: no headers configured" >&2
  exit 1
fi

exec npx --yes mcp-remote@latest "${URL}" \
  --transport http-first \
  "${header_args[@]}"
