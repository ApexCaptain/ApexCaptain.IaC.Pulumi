locals {
  selected_additional_ides = jsondecode(data.coder_parameter.additional_ides.value)

  ubuntu_mirrors = {
    kakao = {
      name         = "Kakao"
      uri          = "http://mirror.kakao.com/ubuntu"
      security_uri = "http://mirror.kakao.com/ubuntu"
    }
    kaist = {
      name         = "KAIST"
      uri          = "http://ftp.kaist.ac.kr/ubuntu"
      security_uri = "http://ftp.kaist.ac.kr/ubuntu"
    }
    official = {
      name         = "Ubuntu Official"
      uri          = "http://archive.ubuntu.com/ubuntu"
      security_uri = "http://security.ubuntu.com/ubuntu"
    }
  }
  # Map for_each is lexicographic; keep the dropdown order explicit.
  ubuntu_mirror_ids      = ["kakao", "kaist", "official"]
  selected_ubuntu_mirror = local.ubuntu_mirrors[data.coder_parameter.ubuntu_mirror.value]

  directory_paths = {
    lifecycle_scripts_directory          = "$HOME/${var.workspace_directory_name}/.lifecycle-scripts"
    auto_stop_workspace_state_directory  = "/tmp/auto-stop-workspace"
    auto_stop_workspace_log_subdir       = ".auto-stop"
    devcontainer_cleaner_state_directory = "/tmp/devcontainer-cleaner"
    devcontainer_cleaner_log_subdir      = ".devcontainer-cleaner"
  }

  scripts_b64 = {
    for eachFile in fileset("./assets/scripts", "*.js") :
    eachFile => filebase64("./assets/scripts/${eachFile}")
  }

  file_paths = {
    default_bashrc = "$HOME/.bashrc"
    lifecycle_scripts = {
      on_start_script = "${local.directory_paths.lifecycle_scripts_directory}/on-start.sh"
      on_start_log    = "${local.directory_paths.lifecycle_scripts_directory}/on-start.log"
      on_stop_script  = "${local.directory_paths.lifecycle_scripts_directory}/on-stop.sh"
      on_stop_log     = "${local.directory_paths.lifecycle_scripts_directory}/on-stop.log"
    }
  }

  # @Note https://coder.ayteneve93.com/icons 에 있는지 우선 찾아보고 없으면 png 파일 추가
  icons_base64_data_url = {
    for eachPngFile in fileset("./assets/icons", "**.png") :
    eachPngFile => "data:image/png;base64,${filebase64("./assets/icons/${eachPngFile}")}"
  }

  files = {
    for eachFile in fileset("./assets/files", "**") :
    eachFile => filebase64("./assets/files/${eachFile}")
  }

  template_paths = {
    for eachTemplate in fileset("./assets/templates", "**") :
    eachTemplate => "./assets/templates/${eachTemplate}"
  }
}