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
    layout:
      name: direct # LVM 없이 디스크 전체 사용
      match: # 위에서부터 첫 번째로 존재하는 Nvme 디스크에 설치 (Nvme가 하나도 없을 경우 에러)
        - path: /dev/nvme0n1
        - path: /dev/nvme1n1
        - path: /dev/nvme2n1

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