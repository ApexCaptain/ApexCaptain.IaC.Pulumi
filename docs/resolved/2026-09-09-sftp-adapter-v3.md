# SFTP Adapter v3

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-09 |
| **해결일** | 2026-09-10 |
| **영역** | `SftpV3Component`, Vault SSH `issue`(키젠), VSO, Reloader, Slack, qBit·Jellyfin |
| **관련 코드** | `common/custom-resources/src/components/adapter/sftp.v3.component.ts`, `infra/k8s-workstation-tools` qBit, `infra/k8s-workstation-apps` Jellyfin, `infra/k8s-workstation-system` Vault SSH CA·identity·`vault-oidc-kv` |
| **스택** | `ApexCaptain/k8s-workstation-tools/prod`, `ApexCaptain/k8s-workstation-apps/prod`, `ApexCaptain/k8s-workstation-system/prod` |
| **상태** | **해결** |

## 해결 요약

qBit·Jellyfin SFTP를 `SftpV3Component`로 올렸다. 와이어는 생 Ed25519. 키는 Vault SSH `issue`가 만들고 cert는 버린다. 사람은 Vault UI에서 user KV `current_private`을 받아 RaiDrive에 넣는다.

라이브 확인: 양쪽 bootstrap Complete, VSO Synced, Reloader, RaiDrive `current_private` 로그인.

v2(SSH cert + 하이브리드 KEX only)는 RaiDrive가 못 붙여서 버렸다. 코드·테스트·라이브 오브젝트 삭제. 플랫폼 `ssh-user-ca` / `ssh-host-ca`와 System identity group은 키젠·사람 KV read용으로 남김.

`SftpV1Component` 코드·유닛 테스트는 남아 있다. 호출자는 없다. 삭제는 [10월 말 관찰 후](../issues/2026-09-10-sftp-v1-removal.md)로 보류.

이 파일은 아래 여섯 개를 합친 아카이브다.

- `docs/superpowers/specs/2026-09-09-sftp-adapter-v3-design.md`
- `docs/superpowers/plans/2026-09-09-sftp-adapter-v3.md`
- `docs/superpowers/specs/2026-09-09-sftp-adapter-v2-design.md` (v3에 흡수, 본문 미유지)
- `docs/superpowers/plans/2026-09-09-sftp-adapter-v2.md` (동일)
- `docs/issues/2026-09-09-sftp-v3-authorized-keys-null.md`
- `docs/issues/2026-09-09-sftp-v3-vso-invalid-role.md`

---

## 배경

v1은 Pulumi tls `PrivateKey` + ConfigMap. 회전 없음.

v2는 Vault SSH CA cert와 `mlkem768x25519-sha256` 전용 KEX. Windows RaiDrive는 비밀번호 또는 생 개인키만 받고, cert·PQC-only KEX를 못 한다.

v3는 키 재료만 Vault에 두고, 와이어는 v1과 같은 생 키로 되돌린다.

## 목표

- 생 Ed25519. sshd `KexAlgorithms` 고정 없음 (OpenSSH 기본, 고전 폴백).
- 키 쌍은 Vault `issue` `key_type=ed25519`. `signed_key` 버림. sidecar에 CA·HostCertificate 없음.
- tls provider로 SSH 키 안 만듦. 개인키는 Pulumi output·레포·Slack·ConfigMap에 안 넣음.
- 호스트키는 배포 1회. 이후 CronJob 없음 (RaiDrive TOFU).
- 유저키는 분기 1회 회전, 옛 키 7일 겹침. Reloader는 **유저** K8s Secret만.
- 사람은 Vault OIDC 후 user KV `current_private`. CLI `issue`로 로그인하지 않음.
- 회전 당일 + 차단 D-1 Slack. webhook은 `SLACK_WEBHOOK_URL_VAULT_ALERTS` (INFRA_ALERTS와 분리).

## 라이브

| 호출자 | 스택 | Pulumi `resourceName` | slug | KV |
|---|---|---|---|---|
| qBittorrent | tools prod | `sftpAdapter` | `sftp-adapter` | `sftp/qbittorrent/sftp-adapter/{host,user}` |
| Jellyfin | apps prod | `jellyfinSftpAdapter` | `jellyfin-sftp-adapter` | `sftp/jellyfin/jellyfin-sftp-adapter/{host,user}` |

Vault kubernetes auth role·policy 이름은 클러스터 전역이다. Jellyfin을 `sftpAdapter`로 두면 qBit VSO role을 덮어쓴다. Jellyfin은 반드시 다른 `resourceName`.

OIDC KV list: system `vault-oidc-kv`가 두 user 경로를 연다. Authentik 그룹 `vault-reader-group-sftp-qbittorrent-sftp-adapter`가 그 정책을 들고 Jellyfin 폴더도 list.

rotate Cron: `0 3 1 1,4,7,10 *` Asia/Seoul. reconcile: `0 3 * * *`.

---

## 아키텍처

1. **플랫폼** — 기존 `ssh-user-ca` / `ssh-host-ca`. 키젠 엔진. 새 CA 마운트 없음.
2. **어댑터** — `SftpV3Component` (`adapter:sftp:v3`). role·정책, bootstrap Job, 분기/매일 CronJob, KV 둘, VSO 둘, Slack Secret, Service, VirtualService, sshd ConfigMap, sidecar spec.
3. **호출자** — spec 주입. Reloader annotation은 user Secret 이름.

```
Vault SSH issue (ed25519)
        │
        ├─ 1회 host ── KV sftp/<ns>/<slug>/host ── VSO ── HostKey (고정)
        │
        └─ 분기 user ── KV sftp/<ns>/<slug>/user ── VSO ── authorized_keys
                                              └── Reloader ── Pod 재시작
                                              └── 사람 read current_private
```

클라이언트: 생 호스트키 TOFU 1회. 유저 개인키 파일. `known_hosts` `@cert-authority` 없음.

경로: `common/custom-resources/src/components/adapter/sftp.v3.component.ts`

### KV (`kvMount` 아래)

| 경로 | 필드 | 사람 | VSO |
|---|---|---|---|
| `sftp/<ns>/<slug>/host` | `private_key`, `public_key` | 없음 | HostKey |
| `sftp/<ns>/<slug>/user` | `current_private`, `current_public`, `previous_*`, `previous_expires_at`, `slack_d1_sent`, `authorized_keys` | 경로 통째 `read` (겹침 기간 previous 개인키도 보임). host 안 보임 | `authorized_keys` + 공개키. **`current_private`은 K8s Secret에 안 넣음** |

KV v2는 필드 ACL이 없다. host와 user를 경로로 나눈다.

### RBAC

- 사람 (System Manager, `GroupPolicies` exclusive=false): user KV `read`만. host·`issue` 없음.
- 발급 Job SA: user+host `issue`, 두 KV write, host KV read.
- VSO SA: 두 KV `read`.
- Slack webhook: K8s Secret. Vault에 안 넣음.

### Job (`timeZone: Asia/Seoul`)

공개키는 Vault `issue`의 `public_key`를 쓰지 않는다. 응답에 그 필드가 없어 문자열 `null`이 나왔다. `private_key`를 파일로 쓰고 `ssh-keygen -y`로 만든다.

- 배포 1회 Job: host + user `issue`. previous 빈 값. Slack 없음. `ignoreChanges: ['spec']` — 스크립트 고친다고 Completed Job을 다시 돌리면 호스트키가 바뀌고 TOFU가 깨진다.
- CronJob `0 3 1 1,4,7,10 *`: user `issue`. 옛 current → previous, 만료 +7일. `authorized_keys` = 두 공개키. Slack 당일 (NS, 이름, 7일 후 차단, Vault user 경로). 키 본문 없음.
- CronJob `0 3 * * *`: previous 만료 삭제. D-1이고 `slack_d1_sent`가 false면 리마인드 후 true. Slack 실패해도 KV는 롤백하지 않음.

호스트 CronJob 없음.

### sidecar / sshd

이미지 digest 핀 유지 (`atmoz/sftp:alpine`).

- `users.conf` (계정/chroot)
- `HostKey` — host Secret을 emptyDir 복사 후 `chmod 600`
- `AuthorizedKeysFile` — user Secret `authorized_keys`
- `HostCertificate` / `TrustedUserCAKeys` / cert-only algorithms 없음
- `PubkeyAuthentication yes`, `PasswordAuthentication no`
- `KexAlgorithms` 지시 없음
- `ChrootDirectory %h`, `ForceCommand internal-sftp`, `SYS_CHROOT`
- native sidecar 아님. `restartPolicy: Always`

### 호출자

- spec 주입, Reloader `secret.reloader.stakater.com/reload: <user Secret 이름>`
- qBit: `'sftpAdapter'`
- Jellyfin: `'jellyfinSftpAdapter'`

### Slack / ESC

로컬 env `SLACK_WEBHOOK_URL_VAULT_ALERTS`. tools·apps ESC. Grafana `SLACK_WEBHOOK_URL_INFRA_ALERTS`와 키를 섞지 않음. URL은 문서·채팅에 적지 않음.

---

## 운영자 (RaiDrive)

1. Vault UI OIDC (System Manager). `secret/` → `sftp/<ns>/<slug>/user` → `current_private` 저장.
2. 호스트 = iptime 도메인, 포트 = Direct Gateway SFTP, 계정 = `adapter.sftp.userName`, 인증 = 그 개인키. 비밀번호 없음.
3. 분기 Slack 오면 7일 안에 새 `current_private`로 교체. D-1에 한 번 더.

호스트키 경고는 첫 연결만. 호스트 회전이 없으므로 이후 TOFU 유지. bootstrap Job을 다시 돌리면 TOFU 다시.

---

## 에러·실패 모드

| 상황 | 기대 |
|---|---|
| 분기 CronJob 실패 | 직전 current 유지. Slack 없음. 다음 분기 또는 수동 Job |
| 매일 Job이 만료 previous를 못 지움 | 겹침이 7일을 넘김. 옛 키로 계속 로그인 |
| Slack 실패, KV 성공 | 키는 바뀜. 알림만 없음. 롤백 없음 |
| Reloader annotation 누락 | authorized_keys는 갱신돼도 sshd는 옛 파일 |
| 사람이 host KV를 읽음 | 정책상 deny |
| VSO가 `current_private`을 Secret에 넣음 | 버그 |
| OpenSSH가 기본으로 ML-KEM을 앞에 둠 | 정상. RaiDrive는 고전 KEX 폴백 |
| bootstrap Job 재실행 | 호스트키 변경. TOFU 깨짐. `ignoreChanges`가 막는 이유 |

---

## 장애 기록

### 1. VSO `invalid role name`

**증상:** `VaultStaticSecret` host·user `SecretSynced=False`. `PUT .../auth/kubernetes/login` → `invalid role name "sftp-adapter-sftp-vso"`. qBit Pod는 첫 싱크 Secret으로 Running. 회전·refresh 막힘.

**원인:** tools state에만 role이 있고 Vault에는 없음. `pulumi refresh --target` (tools 184)에서 VSO role만 deleted. issuer role은 그대로. kubernetes auth 전체 remount는 아님. 왜 VSO role만 사라졌는지는 미확정.

**조치:** tools 185 role 재생성 → policy drift 403 → tools 187 정책 복구, VSO controller 재시작. system 505 `AuthBackend disableRemount: true` (accessor 유지). tools 189 이후 새 400/403 없음. user KV 수리 후 `SecretSynced=True`. host HMAC은 옛 403 문구가 남을 수 있음. 호스트키는 첫 싱크 값으로 동작.

### 2. `authorized_keys`가 `null`

**증상:** sidecar `authorized_keys` 첫 필드 `null`. sshd는 생 ed25519만 받으므로 로그인 실패. 호스트키는 있음.

**원인:** Vault `issue` 응답에 `public_key`가 없다. 필드는 `private_key`, `signed_key`. Job이 `jq -r .data.public_key`라 문자열 `null`을 KV에 넣음.

**조치:** `ssh-keygen -y`로 공개키 생성. reconcile은 `current_public`이 비거나 `null`이면 기존 `current_private`에서만 채움 (새 발급 없음). bootstrap `ignoreChanges`. 라이브: `sftp-repair-public` → user KV v3. 이후 수동 `sftp-rotate-test` KV user v4.

---

## 수용 기준

- [x] `SftpV3Component` 유닛 테스트. tls `PrivateKey` 없음. sshd에 cert/PQC-only KEX 없음
- [x] qBit·Jellyfin v3. Reloader는 user Secret
- [x] `SftpV2Component` 및 v2 테스트 삭제
- [x] 사람 정책은 user KV `read`만
- [x] 분기/매일 CronJob + 당일/D-1 Slack (본문 없이 경로·NS·이름·7일)
- [x] ESC/`projenrc`가 `SLACK_WEBHOOK_URL_VAULT_ALERTS` 연결 (tools·apps)
- [x] sidecar `authorized_keys` 첫 필드 `ssh-ed25519`
- [x] RaiDrive `current_private` 로그인 — qBit·Jellyfin 사용자 확인
- [x] VSO k8s auth role 유지, `disableRemount: true`

## 범위 밖 (후속, 이 파일에 안 닫음)

- `SftpV1Component` 코드·테스트 삭제 — [후속](../issues/2026-09-10-sftp-v1-removal.md) (2026-10-31 이후)
- 호스트키 회전 런북
- CA 마운트 제거 (아직 키젠에 필요)
- OpenSSH 기본에서 고전 KEX까지 빼는 재고정
- Price Quest VSO `403` (별건, 9/7부터)

---

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-09 | v2 설계·구현 (SSH CA cert, 하이브리드 KEX). 플랫폼 CA·identity group 라이브 |
| 2026-09-09 | RaiDrive 불가 확인. v3 설계 — 생 키, `issue`는 키젠만, 분기 유저 회전, Slack |
| 2026-09-09 09:13 UTC | qBit v3 라이브. bootstrap Complete. VSO 첫 싱크 성공 |
| 2026-09-09 12:10 UTC | VSO `invalid role name "sftp-adapter-sftp-vso"` |
| 2026-09-09 | tools 185–187: VSO role·policy 복구. controller 재시작 |
| 2026-09-09 13:09 UTC | system 505: `disableRemount: true` |
| 2026-09-09 13:13 UTC | tools 189. 새 invalid-role 이벤트 없음 |
| 2026-09-09 13:23 UTC | `authorized_keys`=`null` 확인 |
| 2026-09-09 13:40 UTC | tools 190. `ssh-keygen -y`. bootstrap 재실행 없음 |
| 2026-09-09 13:41 UTC | `sftp-repair-public` Complete. KV user v3. VSO user Synced. Reloader qBit |
| 2026-09-09 23:32 UTC | 수동 `sftp-rotate-test` Complete. KV user v4. Reloader `qbittorrent-54758c7b79` 3/3 |
| 2026-09-10 | 사용자: qBit RaiDrive 로그인 정상 |
| 2026-09-10 | Jellyfin `SftpV1` → `SftpV3` (`jellyfinSftpAdapter`). system `vault-oidc-kv`에 Jellyfin user list. apps 138. bootstrap Complete, VSO Synced, `jellyfin-7bb6488d47` 3/3 |
| 2026-09-10 | 사용자: Jellyfin RaiDrive `current_private` 로그인 정상. 아카이브 |
| 2026-09-10 | v1 삭제를 `docs/issues/2026-09-10-sftp-v1-removal.md`로 분리. 10월 말까지 v3 관찰 |
