# GitHub External Auth가 계정에 연결되어 있으면 GIT_ASKPASS와
# GH_TOKEN/GITHUB_TOKEN(에이전트 env)으로 주입하고, 없으면 워크스페이스 시작을 막지 않는다.
# (CODER_EXTERNAL_AUTH_0_ID=github)
data "coder_external_auth" "github" {
  id       = "github"
  optional = true
}
