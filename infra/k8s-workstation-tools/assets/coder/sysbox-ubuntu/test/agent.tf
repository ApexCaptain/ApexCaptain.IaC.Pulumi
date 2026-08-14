resource "coder_agent" "main" {
  os   = "linux"
  arch = "amd64"

  # GitHub External Auth 토큰. gh CLI·DevContainer로 넘길 때 사용한다.
  # GIT_ASKPASS와 달리 빌드 시점 스냅샷이며, 미연결이면 빈 값이다.
  env = {
    GH_TOKEN     = data.coder_external_auth.github.access_token
    GITHUB_TOKEN = data.coder_external_auth.github.access_token
  }

  display_apps {
    port_forwarding_helper = true
    ssh_helper             = true
    vscode                 = contains(local.selected_additional_ides, "vscode-desktop")
    vscode_insiders        = false
    web_terminal           = contains(local.selected_additional_ides, "terminal")
  }

  metadata {
    display_name = "CPU Usage"
    key          = "0_cpu_usage"
    script       = "coder stat cpu --host"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "RAM Usage"
    key          = "1_ram_usage"
    script       = "coder stat mem --host"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "Home Disk"
    key          = "2_home_disk"
    script       = "coder stat disk --path $${HOME}"
    interval     = 60
    timeout      = 1
  }

  metadata {
    display_name = "Docker Disk"
    key          = "3_docker_disk"
    script       = "coder stat disk --path /var/lib/docker"
    interval     = 60
    timeout      = 1
  }

  metadata {
    display_name = "Data Disk"
    key          = "4_data_disk"
    script       = "coder stat disk --path /home/coder/data"
    interval     = 60
    timeout      = 1
  }

  metadata {
    display_name = "Load Average"
    key          = "5_load_host"
    script       = <<EOT
      echo "`cat /proc/loadavg | awk '{ print $1 }'` `nproc`" | awk '{ printf "%0.2f", $1/$2 }'
    EOT
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "Auto Stop"
    key          = "6_auto_stop"
    script = templatefile(local.template_paths["auto-stop-dashboard.sh.tpl"], {
      state_file = "${local.directory_paths.auto_stop_workspace_state_directory}/workspace-status.json"
      mode       = "remaining"
    })
    interval = 10
    timeout  = 3
  }

  metadata {
    display_name = "Activity"
    key          = "7_activity"
    script = templatefile(local.template_paths["auto-stop-dashboard.sh.tpl"], {
      state_file = "${local.directory_paths.auto_stop_workspace_state_directory}/workspace-status.json"
      mode       = "activity"
    })
    interval = 10
    timeout  = 3
  }
}
