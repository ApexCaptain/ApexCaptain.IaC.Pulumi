#cloud-config
# 공통 netplan. ethernets 블록에서 YAML anchor(&static-net)로 재사용.
x-static-net: &static-net
  dhcp4: no
  wakeonlan: true
  routes:
    - to: default
      via: {{ gatewayIp }}
  nameservers:
    addresses:
      {{#each nameServersAddresses}}
        - {{ this }}
      {{/each}}

autoinstall:
  version: 1

  locale: en_US.UTF-8
  keyboard:
    layout: us

  identity:
    hostname: {{ hostname }}
    username: {{ userName }}
    password: '{{{ passwordHash }}}'

  ssh:
    install-server: true
    allow-pw: false # 키 인증만. password는 콘솔/비상용.
    authorized-keys:
      {{#each authorizedKeys}}
        - '{{ this }}'
      {{/each}}

  network:
    network: # autoinstall netplan 래퍼 (아래 version/ethernets가 netplan 본문)
      version: 2
      ethernets:
        {{#each nodes}}
        {{ id }}: # YAML 블록 라벨 (실제 NIC 이름과 무관)
          <<: *static-net
          match:
            macaddress: '{{ macAddress }}' # 이 MAC의 NIC에만 아래 IP 적용
          addresses:
            - '{{ addressCidr }}'
        {{/each}}

  storage:
    version: 1
    config:
      # 1. 대상 물리 디스크 조건 지정 (NVMe 전용)
      - id: main-disk
        type: disk
        match:
          # 물리 NVMe SSD 최소 크기
          size:
            min: {{ disk.minDiskSize }}
          # [SATA 제외] 오직 NVMe 디스크 경로만 검사 목록에 등록
          path:
            - /dev/nvme0n1
            - /dev/nvme1n1
            - /dev/nvme2n1
        # 만약 위 목록에 부합하는 디스크가 없으면 인스톨러가 에러를 내며 멈춤

      # 2. UEFI 부팅을 위한 필수 ESP 파티션 생성 (1GB)
      - id: esp-partition
        type: partition
        device: main-disk
        size: 1024M
        flag: boot

      # 3. ESP 파티션 포맷 (FAT32)
      - id: esp-format
        type: format
        volume: esp-partition
        fstype: fat32

      # 4. ESP 마운트 위치 지정 (/boot/efi)
      - id: esp-mount
        type: mount
        device: esp-format
        path: /boot/efi

      # 5. 루트(/) 파티션 생성
      - id: root-partition
        type: partition
        device: main-disk
        size: {{ disk.rootPartitionSize }}

      # 6. 루트 파티션 포맷 (ext4)
      - id: root-format
        type: format
        volume: root-partition
        fstype: ext4

      # 7. 루트 마운트 위치 지정 (/)
      - id: root-mount
        type: mount
        device: root-format
        path: /

  updates: security # 보안 업데이트만 자동 적용

  # Ansible 등 자동화용 passwordless sudo (재부팅 전 chroot에 반영)
  late-commands:
    - curtin in-target -- sh -c "echo '{{ userName }} ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/{{ userName }}"
    - curtin in-target -- chmod 440 /etc/sudoers.d/{{ userName }}

  # 설치 완료 후 첫 부팅 시 Slack 알림
  user-data:
    runcmd:
      - |
        SLACK_WEBHOOK_URL='{{ slackWebhookUrl }}'
        IP=$(hostname -I | awk '{print $1}')
        curl -sS -X POST "$SLACK_WEBHOOK_URL" \
          -H 'Content-Type: application/json' \
          -d "$(printf '{"text":"✅ Autoinstall complete\n• IP: %s"}' "$IP")" \
          || true