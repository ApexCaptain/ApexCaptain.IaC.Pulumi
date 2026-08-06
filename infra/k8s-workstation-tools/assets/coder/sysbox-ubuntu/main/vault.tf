resource "coder_env" "vault_addr" {
  count    = data.coder_workspace.me.start_count
  agent_id = coder_agent.main.id
  name     = "VAULT_ADDR"
  value    = var.vault_addr
}

resource "coder_script" "vault_login" {
  count        = data.coder_workspace.me.start_count
  agent_id     = coder_agent.main.id
  display_name = "Vault (Authentik SSO)"
  icon         = "/icon/vault.svg"
  run_on_start = true
  # Vault 권한 없는 사용자(Coder-only)도 workspace 접속 가능해야 함
  start_blocks_login = false
  script = templatefile("${path.module}/assets/templates/vault-login.sh.tpl", {
    oidc_access_token   = data.coder_workspace_owner.me.oidc_access_token
    vault_jwt_auth_path = var.vault_jwt_auth_path
    vault_jwt_role      = var.vault_jwt_role
  })
}
