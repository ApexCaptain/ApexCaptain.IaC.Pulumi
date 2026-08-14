data "coder_parameter" "cpu" {
  name         = "cpu"
  display_name = "CPU"
  description  = "사용 가능한 최대 CPU 코어 수입니다."
  default      = "2"
  icon         = local.icons_base64_data_url["cpu.png"]
  mutable      = true
  option {
    name  = "2 Cores"
    value = "2"
  }
  option {
    name  = "4 Cores"
    value = "4"
  }
  option {
    name  = "6 Cores"
    value = "6"
  }
  option {
    name  = "8 Cores"
    value = "8"
  }
  order = 1
}

data "coder_parameter" "memory" {
  name         = "memory"
  display_name = "Memory"
  description  = "사용 가능한 최대 메모리(GB)입니다."
  default      = "4"
  icon         = local.icons_base64_data_url["ram.png"]
  mutable      = true
  option {
    name  = "4 GB"
    value = "4"
  }
  option {
    name  = "6 GB"
    value = "6"
  }
  option {
    name  = "8 GB"
    value = "8"
  }
  option {
    name  = "10 GB"
    value = "10"
  }
  option {
    name  = "12 GB"
    value = "12"
  }
  order = 2
}

data "coder_parameter" "home_disk_size" {
  name         = "home_disk_size"
  display_name = "(SSD) Home 디스크 사이즈 (GB)"
  description  = "최소: 10 GB, 최대: 100 GB. /home/coder 디렉토리에 마운트됩니다. 디스크 사이즈는 확장만 가능합니다."
  default      = "10"
  type         = "number"
  icon         = local.icons_base64_data_url["ssd.png"]
  mutable      = true
  validation {
    min       = 10
    max       = 100
    monotonic = "increasing"
  }
  order = 3
}

data "coder_parameter" "docker_disk_size" {
  name         = "docker_disk_size"
  display_name = "(SSD) Docker 디스크 사이즈 (GB)"
  description  = "최소: 10 GB, 최대: 100 GB. /var/lib/docker 디렉토리에 마운트됩니다. 디스크 사이즈는 확장만 가능합니다."
  default      = "10"
  type         = "number"
  icon         = local.icons_base64_data_url["ssd.png"]
  mutable      = true
  validation {
    min       = 10
    max       = 100
    monotonic = "increasing"
  }
  order = 4
}

data "coder_parameter" "data_disk_size" {
  name         = "data_disk_size"
  display_name = "(HDD) Data 디스크 사이즈 (GB)"
  description  = "최소: 10 GB, 최대: 300 GB. /home/coder/data 디렉토리에 마운트됩니다. 디스크 사이즈는 확장만 가능합니다."
  default      = "10"
  type         = "number"
  icon         = local.icons_base64_data_url["hdd.png"]
  mutable      = true
  validation {
    min       = 10
    max       = 300
    monotonic = "increasing"
  }
  order = 5
}

data "coder_parameter" "additional_ides" {
  name         = "additional_ides"
  display_name = "IDE"
  mutable      = true
  default      = "[\"vscode-desktop\"]"
  form_type    = "multi-select"
  type         = "list(string)"
  icon         = local.icons_base64_data_url["development.png"]

  option {
    name  = "VS Code (Desktop)"
    value = "vscode-desktop"
    icon  = local.icons_base64_data_url["vscode.png"]
  }
  option {
    name  = "VS Code (Web)"
    value = "vscode-web"
    icon  = local.icons_base64_data_url["vscode.png"]
  }
  option {
    name  = "Terminal"
    value = "terminal"
    icon  = "/icon/terminal.svg"
  }
  option {
    name  = "Cursor"
    value = "cursor"
    icon  = "/icon/cursor.svg"
  }

  order = 6
}

data "coder_parameter" "fuse_count" {
  name         = "fuse_count"
  display_name = "Fuse Device 수"
  description  = "Fuse Device 수를 선택합니다. Rclone과 같은 도구를 사용해 Google Drive, OneDrive 등을 마운트할 때 사용됩니다."
  default      = "0"
  type         = "number"
  icon         = local.icons_base64_data_url["cloud.png"]
  mutable      = true
  order        = 7
  validation {
    min = 0
    max = var.device_plugin_fuse_count_limit
  }
}

data "coder_parameter" "auto_stop_workspace" {
  name         = "auto_stop_workspace"
  display_name = "Auto Stop Workspace"
  description  = "IDE·SSH·웹 터미널 세션이 없고 실행 중인 컨테이너도 없으면 워크스페이스를 종료합니다."
  default      = true
  type         = "bool"
  icon         = local.icons_base64_data_url["stop.png"]
  mutable      = true
  order        = 8
}

data "coder_parameter" "auto_stop_workspace_wait_mins" {
  count        = data.coder_parameter.auto_stop_workspace.value ? 1 : 0
  name         = "auto_stop_workspace_wait_mins"
  display_name = "Auto Stop Workspace 대기 시간 (분)"
  description  = "비활성 상태로 유지된 시간이 이 값을 초과하면 워크스페이스를 자동으로 종료합니다."
  default      = 10
  type         = "number"
  icon         = local.icons_base64_data_url["time.png"]
  mutable      = true
  validation {
    min = 10
  }
  order = 9
}

data "coder_parameter" "enable_devcontainer_cleaner" {
  name         = "enable_devcontainer_cleaner"
  display_name = "DevContainer Cleaner 활성화"
  description  = "IDE·터미널이 붙지 않은 DevContainer를 종료합니다. 'devcontainer-cleaner.skip=true' 라벨은 건너뜁니다."
  default      = true
  type         = "bool"
  icon         = local.icons_base64_data_url["cleaning.png"]
  mutable      = true
  order        = 10
}

data "coder_parameter" "devcontainer_cleaner_wait_mins" {
  count        = data.coder_parameter.enable_devcontainer_cleaner.value ? 1 : 0
  name         = "devcontainer_cleaner_wait_mins"
  display_name = "DevContainer Cleaner 대기 시간 (분)"
  description  = "비활성 상태로 유지된 시간이 이 값을 초과하면 미사용 DevContainer로 간주해 자동으로 종료(Stop)합니다."
  default      = 10
  type         = "number"
  icon         = local.icons_base64_data_url["time.png"]
  mutable      = true
  validation {
    min = 10
  }
  order = 11
}

data "coder_parameter" "ubuntu_mirror" {
  name         = "ubuntu_mirror"
  display_name = "Ubuntu APT Mirror"
  description  = "워크스페이스 apt가 사용할 Ubuntu 패키지 미러입니다."
  default      = "kakao"
  icon         = "/icon/ubuntu.svg"
  mutable      = true
  form_type    = "dropdown"
  order        = 12

  dynamic "option" {
    for_each = local.ubuntu_mirror_ids
    content {
      name        = local.ubuntu_mirrors[option.value].name
      value       = option.value
      description = local.ubuntu_mirrors[option.value].uri
    }
  }
}

data "coder_workspace" "me" {}

data "coder_workspace_owner" "me" {}