resource "kubernetes_persistent_volume_claim_v1" "home" {
  metadata {
    name      = "coder-${data.coder_workspace.me.id}-home"
    namespace = var.namespace
    labels = {
      "app.kubernetes.io/name"     = "coder-home-pvc"
      "app.kubernetes.io/instance" = "coder-home-pvc-${data.coder_workspace.me.id}"
      "app.kubernetes.io/part-of"  = "coder"
      // Coder-specific labels.
      "com.coder.resource"       = "true"
      "com.coder.workspace.id"   = data.coder_workspace.me.id
      "com.coder.workspace.name" = data.coder_workspace.me.name
      "com.coder.user.id"        = data.coder_workspace_owner.me.id
      "com.coder.user.username"  = data.coder_workspace_owner.me.name
    }
    annotations = {
      "com.coder.user.email" = data.coder_workspace_owner.me.email
    }
  }
  wait_until_bound = false
  spec {
    storage_class_name = var.home_storage_class_name
    access_modes       = ["ReadWriteOnce"]
    # virtiofs는 작은 파일 I/O가 느려 블록 장치로 넘겨 게스트에서 ext4 마운트 (main 컨테이너 시작 명령)
    volume_mode = "Block"
    resources {
      requests = {
        storage = "${data.coder_parameter.home_disk_size.value}Gi"
      }
    }
  }
  lifecycle {
    ignore_changes = [
      metadata,
      spec[0].access_modes,
      spec[0].storage_class_name,
      spec[0].volume_mode,
      spec[0].selector,
      spec[0].volume_name,
    ]
  }
}

resource "kubernetes_persistent_volume_claim_v1" "docker" {
  metadata {
    name      = "coder-${data.coder_workspace.me.id}-docker"
    namespace = var.namespace
    labels = {
      "app.kubernetes.io/name"     = "coder-docker-pvc"
      "app.kubernetes.io/instance" = "coder-docker-pvc-${data.coder_workspace.me.id}"
      "app.kubernetes.io/part-of"  = "coder"
      // Coder-specific labels.
      "com.coder.resource"       = "true"
      "com.coder.workspace.id"   = data.coder_workspace.me.id
      "com.coder.workspace.name" = data.coder_workspace.me.name
      "com.coder.user.id"        = data.coder_workspace_owner.me.id
      "com.coder.user.username"  = data.coder_workspace_owner.me.name
    }
    annotations = {
      "com.coder.user.email" = data.coder_workspace_owner.me.email
    }
  }
  wait_until_bound = false
  spec {
    storage_class_name = var.docker_storage_class_name
    access_modes       = ["ReadWriteOnce"]
    # overlay2 on virtio-fs 미지원 → 블록 장치로 넘겨 게스트에서 ext4 마운트 (scripts.tf run-dockerd)
    volume_mode = "Block"
    resources {
      requests = {
        storage = "${data.coder_parameter.docker_disk_size.value}Gi"
      }
    }
  }
  lifecycle {
    ignore_changes = [
      metadata,
      spec[0].access_modes,
      spec[0].storage_class_name,
      spec[0].volume_mode,
      spec[0].selector,
      spec[0].volume_name,
    ]
  }
}

resource "kubernetes_persistent_volume_claim_v1" "data" {
  metadata {
    name      = "coder-${data.coder_workspace.me.id}-data"
    namespace = var.namespace
    labels = {
      "app.kubernetes.io/name"     = "coder-data-pvc"
      "app.kubernetes.io/instance" = "coder-data-pvc-${data.coder_workspace.me.id}"
      "app.kubernetes.io/part-of"  = "coder"
      // Coder-specific labels.
      "com.coder.resource"       = "true"
      "com.coder.workspace.id"   = data.coder_workspace.me.id
      "com.coder.workspace.name" = data.coder_workspace.me.name
      "com.coder.user.id"        = data.coder_workspace_owner.me.id
      "com.coder.user.username"  = data.coder_workspace_owner.me.name
    }
    annotations = {
      "com.coder.user.email" = data.coder_workspace_owner.me.email
    }
  }
  wait_until_bound = false
  spec {
    storage_class_name = var.data_storage_class_name
    access_modes       = ["ReadWriteOnce"]
    resources {
      requests = {
        storage = "${data.coder_parameter.data_disk_size.value}Gi"
      }
    }
  }
  lifecycle {
    ignore_changes = [
      metadata,
      spec[0].access_modes,
      spec[0].storage_class_name,
      spec[0].volume_mode,
      spec[0].selector,
      spec[0].volume_name,
    ]
  }
}

resource "kubernetes_config_map_v1" "docker_daemon_json" {
  count = data.coder_workspace.me.start_count
  metadata {
    name      = "coder-${data.coder_workspace.me.id}-docker-daemon-json"
    namespace = var.namespace
    labels = {
      "app.kubernetes.io/name"     = "coder-docker-daemon-json"
      "app.kubernetes.io/instance" = "coder-docker-daemon-json-${data.coder_workspace.me.id}"
      "app.kubernetes.io/part-of"  = "coder"
      "com.coder.resource"         = "true"
      "com.coder.workspace.id"     = data.coder_workspace.me.id
      "com.coder.workspace.name"   = data.coder_workspace.me.name
      "com.coder.user.id"          = data.coder_workspace_owner.me.id
      "com.coder.user.username"    = data.coder_workspace_owner.me.name
    }
    annotations = {
      "com.coder.user.email" = data.coder_workspace_owner.me.email
    }
  }
  data = {
    "daemon.json" = <<-EOT
      {
        "mtu": 1400,
        "default-network-opts": {
          "bridge": {
            "com.docker.network.driver.mtu": "1400"
          }
        }
      }
    EOT
  }
}

resource "kubernetes_service_v1" "main" {
  count = data.coder_workspace.me.start_count
  metadata {
    name      = "coder-${data.coder_workspace.me.id}"
    namespace = var.namespace
    labels = {
      "app.kubernetes.io/name"     = "coder-workspace-svc"
      "app.kubernetes.io/instance" = "coder-workspace-svc-${data.coder_workspace.me.id}"
      "app.kubernetes.io/part-of"  = "coder"
      "com.coder.resource"         = "true"
      "com.coder.workspace.id"     = data.coder_workspace.me.id
      "com.coder.workspace.name"   = data.coder_workspace.me.name
      "com.coder.user.id"          = data.coder_workspace_owner.me.id
      "com.coder.user.username"    = data.coder_workspace_owner.me.name
    }
  }
  spec {
    selector = {
      "app.kubernetes.io/name"     = "coder-workspace"
      "app.kubernetes.io/instance" = "coder-workspace-${data.coder_workspace.me.id}"
      "app.kubernetes.io/part-of"  = "coder"
      "com.coder.resource"         = "true"
      "com.coder.workspace.id"     = data.coder_workspace.me.id
      "com.coder.workspace.name"   = data.coder_workspace.me.name
      "com.coder.user.id"          = data.coder_workspace_owner.me.id
      "com.coder.user.username"    = data.coder_workspace_owner.me.name
    }
    cluster_ip = "None"
  }
}

resource "kubernetes_manifest" "main" {
  count = data.coder_workspace.me.start_count
  manifest = {
    apiVersion = "apps/v1"
    kind       = "Deployment"
    metadata = {
      name      = "coder-${data.coder_workspace.me.id}"
      namespace = var.namespace
      annotations = {
        "com.coder.user.email" = data.coder_workspace_owner.me.email
      }
      labels = {
        "app.kubernetes.io/name"     = "coder-workspace"
        "app.kubernetes.io/instance" = "coder-workspace-${data.coder_workspace.me.id}"
        "app.kubernetes.io/part-of"  = "coder"
        "com.coder.resource"         = "true"
        "com.coder.workspace.id"     = data.coder_workspace.me.id
        "com.coder.workspace.name"   = data.coder_workspace.me.name
        "com.coder.user.id"          = data.coder_workspace_owner.me.id
        "com.coder.user.username"    = data.coder_workspace_owner.me.name
      }
    }
    spec = {
      replicas = 1
      selector = {
        matchLabels = {
          "app.kubernetes.io/name"     = "coder-workspace"
          "app.kubernetes.io/instance" = "coder-workspace-${data.coder_workspace.me.id}"
          "app.kubernetes.io/part-of"  = "coder"
          "com.coder.resource"         = "true"
          "com.coder.workspace.id"     = data.coder_workspace.me.id
          "com.coder.workspace.name"   = data.coder_workspace.me.name
          "com.coder.user.id"          = data.coder_workspace_owner.me.id
          "com.coder.user.username"    = data.coder_workspace_owner.me.name
        }
      }
      strategy = {
        type = "Recreate"
      }
      template = {
        metadata = {
          labels = {
            "app.kubernetes.io/name"     = "coder-workspace"
            "app.kubernetes.io/instance" = "coder-workspace-${data.coder_workspace.me.id}"
            "app.kubernetes.io/part-of"  = "coder"
            "com.coder.resource"         = "true"
            "com.coder.workspace.id"     = data.coder_workspace.me.id
            "com.coder.workspace.name"   = data.coder_workspace.me.name
            "com.coder.user.id"          = data.coder_workspace_owner.me.id
            "com.coder.user.username"    = data.coder_workspace_owner.me.name
            // ambient는 Kata(tcfilter)에서 동작하지 않는다 → sidecar
            "istio.io/dataplane-mode" = "none"
            "sidecar.istio.io/inject" = "true"
          }
          annotations = {
            "proxy.istio.io/config" = jsonencode({ holdApplicationUntilProxyStarts = true })
          }
        }
        spec = {
          runtimeClassName   = var.runtime_class_name
          enableServiceLinks = false
          securityContext = {
            runAsUser    = 1000
            runAsNonRoot = false
          }
          hostname = "ws-${replace(lower(data.coder_workspace.me.name), "_", "-")}"
          initContainers = [
            {
              // 인젝터가 같은 이름의 init 컨테이너에 병합한다. CNI 모드 기본값(--run-validation --skip-rule-apply)은
              // 호스트 쪽 pod netns 규칙을 검증하는데, Kata는 VM 트래픽이 그 규칙을 우회한다 → 게스트에서 직접 iptables 적용
              // Deployment 검증이 주입 전이라 image가 필요하다
              name  = "istio-validation"
              image = var.istio_proxy_image
              args = [
                "istio-iptables",
                "-p", "15001",
                "-z", "15006",
                "-u", "1337",
                "-m", "REDIRECT",
                "-i", "*",
                "-x", "",
                "-b", "*",
                "-d", "15090,15021,15020",
                "--log_output_level=default:info",
              ]
              securityContext = {
                runAsUser                = 0
                runAsGroup               = 0
                runAsNonRoot             = false
                readOnlyRootFilesystem   = false
                allowPrivilegeEscalation = false
                capabilities = {
                  add  = ["NET_ADMIN", "NET_RAW"]
                  drop = ["ALL"]
                }
              }
            },
            {
              name  = "setup-home-directory"
              image = "busybox"
              // home은 블록 장치라 main 컨테이너가 마운트·chown 한다
              command = ["sh", "-c", "chown -R 1000:1000 ${local.data_staging_path}"]
              securityContext = {
                runAsUser = 0
              }
              volumeMounts = [
                {
                  name      = "data"
                  mountPath = local.data_staging_path
                }
              ]
            }
          ],
          containers = [
            {
              name            = "dev"
              image           = "codercom/enterprise-base:ubuntu-resolute"
              imagePullPolicy = "IfNotPresent"
              command = [
                "sh",
                "-c",
                <<-EOT
                  # home PVC(Block): 첫 기동에 ext4 포맷, 매 기동 마운트·온라인 확장(resize2fs)
                  if ! mountpoint -q /home/coder; then
                    if ! sudo blkid ${local.home_device_path} >/dev/null 2>&1; then
                      command -v mkfs.ext4 >/dev/null 2>&1 || { sudo apt-get update -y && sudo apt-get install -y e2fsprogs; }
                      sudo mkfs.ext4 -q -L home ${local.home_device_path}
                    fi
                    sudo mount ${local.home_device_path} /home/coder
                    sudo resize2fs ${local.home_device_path} >/dev/null 2>&1 || true
                    sudo chown 1000:1000 /home/coder
                  fi
                  # data(HDD)는 kubelet이 staging 경로에 마운트 → home 마운트 위로 bind
                  mkdir -p /home/coder/data
                  if ! mountpoint -q /home/coder/data; then
                    sudo mount --bind ${local.data_staging_path} /home/coder/data
                  fi
                  if [ -f /etc/apt/sources.list.d/ubuntu.sources ]; then
                    sudo sed -i -E \
                      -e 's|URIs: https?://([a-z0-9.-]+\.)?archive\.ubuntu\.com/ubuntu/?|URIs: ${local.selected_ubuntu_mirror.uri}|g' \
                      -e 's|URIs: https?://security\.ubuntu\.com/ubuntu/?|URIs: ${local.selected_ubuntu_mirror.security_uri}|g' \
                      /etc/apt/sources.list.d/ubuntu.sources
                  fi
                  if [ -f /etc/apt/sources.list ]; then
                    sudo sed -i -E \
                      -e 's|https?://([a-z0-9.-]+\.)?archive\.ubuntu\.com/ubuntu|${local.selected_ubuntu_mirror.uri}|g' \
                      -e 's|https?://security\.ubuntu\.com/ubuntu|${local.selected_ubuntu_mirror.security_uri}|g' \
                      /etc/apt/sources.list
                  fi
                  # FUSE: 호스트 장치는 안 넘어오므로(privileged_without_host_devices) 게스트 커널 장치를 직접 만든다
                  if [ ! -e /dev/fuse ]; then
                    sudo mknod -m 666 /dev/fuse c 10 229
                  fi
                  # fusermount3 -u 가 /etc/mtab 을 찾는다
                  if [ ! -e /etc/mtab ]; then
                    sudo ln -s /proc/self/mounts /etc/mtab
                  fi
                  # devContainer 브리지(docker0, br-*)는 Istio OUTPUT 규칙을 타지 않는다 (FORWARD 경로)
                  # TCP는 Envoy outbound(15001)로 보내고, DNS는 Istio raw 규칙의 응답 conntrack zone(1)에 맞춰야 MASQUERADE가 풀린다
                  IPT=iptables
                  command -v iptables-nft >/dev/null 2>&1 && IPT=iptables-nft
                  [ "$(sudo iptables-legacy -t nat -S 2>/dev/null | grep -c ISTIO)" -gt 0 ] && IPT=iptables-legacy
                  for ifc in docker0 'br-+'; do
                    sudo $IPT -t nat -C PREROUTING -i "$ifc" -p tcp -j REDIRECT --to-ports 15001 2>/dev/null \
                      || sudo $IPT -t nat -I PREROUTING 1 -i "$ifc" -p tcp -j REDIRECT --to-ports 15001
                    sudo $IPT -t raw -C PREROUTING -i "$ifc" -p udp --dport 53 -j CT --zone 1 2>/dev/null \
                      || sudo $IPT -t raw -I PREROUTING 1 -i "$ifc" -p udp --dport 53 -j CT --zone 1
                  done
                  sudo apt-get update -y
                  if [ ! -f /home/coder/.bashrc ]; then
                    echo '${local.files["default.bashrc"]}' | base64 -d > /home/coder/.bashrc
                  fi
                  ${coder_agent.main.init_script}
                 EOT
              ]
              securityContext = {
                runAsUser = 1000
                // VM 안에서만 privileged (containerd 핸들러 privileged_without_host_devices)
                privileged = true
              }
              env = [
                {
                  name  = "TZ"
                  value = "Asia/Seoul"
                },
                {
                  name  = "CODER_AGENT_TOKEN"
                  value = coder_agent.main.token
                },
                {
                  name  = "CODER_WORKSPACE_SERVICE_DOMAIN"
                  value = "${kubernetes_service_v1.main[count.index].metadata[0].name}.${var.namespace}.svc.cluster.local"
                },
              ]
              resources = {
                requests = {
                  cpu = "${ceil(tonumber(data.coder_parameter.cpu.value) / 4)}"
                  // VM 메모리는 게스트 페이지 캐시로 limit까지 차고 잘 반환되지 않는다 → 스케줄러 집계를 실사용에 맞춤
                  memory = "${data.coder_parameter.memory.value}Gi"
                }
                limits = {
                  cpu    = "${data.coder_parameter.cpu.value}"
                  memory = "${data.coder_parameter.memory.value}Gi"
                }
              }
              volumeMounts = [
                // User Home Volume
                // Data Volume
                {
                  name      = "data"
                  mountPath = local.data_staging_path
                },
                // Docker Daemon JSON CM
                {
                  name      = "docker-daemon-json"
                  mountPath = "/etc/docker/daemon.json"
                  subPath   = "daemon.json"
                }
              ]
              // home·docker PVC(Block) → 게스트 블록 장치
              volumeDevices = [
                {
                  name       = "home"
                  devicePath = local.home_device_path
                },
                {
                  name       = "docker"
                  devicePath = local.docker_device_path
                }
              ]
            },
          ]
          volumes = [
            // Home PVC
            {
              name = "home"
              persistentVolumeClaim = {
                claimName = kubernetes_persistent_volume_claim_v1.home.metadata[0].name
              }
            },
            // Docker PVC
            {
              name = "docker"
              persistentVolumeClaim = {
                claimName = kubernetes_persistent_volume_claim_v1.docker.metadata[0].name
              }
            },
            // Data PVC
            {
              name = "data"
              persistentVolumeClaim = {
                claimName = kubernetes_persistent_volume_claim_v1.data.metadata[0].name
              }
            },
            // Docker Daemon JSON ConfigMap
            {
              name = "docker-daemon-json"
              configMap = {
                name = kubernetes_config_map_v1.docker_daemon_json[count.index].metadata[0].name
                items = [
                  {
                    key  = "daemon.json"
                    path = "daemon.json"
                  }
                ]
              }
            }
          ]
          affinity = {
            podAntiAffinity = {
              preferredDuringSchedulingIgnoredDuringExecution = [
                {
                  weight = 1
                  podAffinityTerm = {
                    topologyKey = "kubernetes.io/hostname"
                    labelSelector = {
                      matchExpressions = [
                        {
                          key      = "app.kubernetes.io/name"
                          operator = "In"
                          values = [
                            "coder-workspace"
                          ]
                        }
                      ]
                    }
                  }
                }
              ]
            }
          }
        }
      }
    }
  }
}