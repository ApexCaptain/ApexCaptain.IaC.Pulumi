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

  // --host는 Kata VM 전체(기본 + 사이드카 몫)를 읽는다 → 컨테이너 cgroup 제한 기준
  metadata {
    display_name = "CPU Usage"
    key          = "0_cpu_usage"
    script       = "coder stat cpu"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "RAM Usage"
    key          = "1_ram_usage"
    script       = "coder stat mem"
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
    // run-dockerd가 블록 디스크를 마운트하기 전엔 경로가 없다
    script   = "coder stat disk --path /var/lib/docker 2>/dev/null || echo '준비 중'"
    interval = 60
    timeout  = 1
  }

  metadata {
    display_name = "Data Disk"
    key          = "4_data_disk"
    script       = "coder stat disk --path /home/coder/data"
    interval     = 60
    timeout      = 1
  }

  metadata {
    display_name = "Rclone Mounts"
    key          = "4_rclone_mounts"
    // 정상 마운트 수 / ~/.config/rclone/mounts 항목 수
    script   = "rclone-mounts status 2>/dev/null || echo '준비 중'"
    interval = 30
    timeout  = 1
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
