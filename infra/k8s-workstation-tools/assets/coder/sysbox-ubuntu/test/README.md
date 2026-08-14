# Ubuntu on Sysbox

[Sysbox](https://github.com/nestybox/sysbox) 위에서 도는 Ubuntu 워크스페이스입니다.
일반 컨테이너와 달리 안에서 **Docker**와 **DevContainer**를 그대로 쓸 수 있습니다.

## ⚙️ 파라미터

| 파라미터             | 설명                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| CPU / Memory         | 워크스페이스에 줄 최대 리소스입니다. 재시작 없이 바꿀 수 있습니다.                                     |
| (SSD) Home           | `/home/coder` 홈 디렉터리입니다. 10–100 GB, **확장만 가능**합니다.                                     |
| (SSD) Docker         | Docker 이미지·컨테이너용입니다. `/var/lib/docker`, 10–100 GB, 확장만 가능합니다.                       |
| (HDD) Data           | 대용량 파일용입니다. `/home/coder/data`, 10–300 GB, 확장만 가능합니다.                                 |
| IDE                  | VS Code(Desktop/Web), Cursor, Terminal 중 고릅니다. 여러 개 선택할 수 있습니다.                        |
| Fuse Device 수       | Google Drive, OneDrive 등을 마운트할 때 씁니다. 안 쓰면 0으로 두세요.                                  |
| Auto Stop            | IDE(VS Code/Cursor)·SSH·웹 터미널이 없고 실행 중인 컨테이너도 없으면 워크스페이스를 끕니다. 로그는 `~/.auto-stop/<시작시각>.log`입니다. |
| DevContainer Cleaner | 그 컨테이너에 IDE·터미널이 없으면 종료합니다. `devcontainer-cleaner.skip=true` 라벨은 건너뜁니다. 로그는 `~/.devcontainer-cleaner/<시작시각>.log`입니다. |

디스크는 한 번 키우면 **줄일 수 없습니다.** 큰 파일은 HDD(`~/data`)에 두는 편이 좋습니다.

## ✨ 기본 기능

### 🔐 Vault 자동 로그인

시작할 때 Coder(Authentik) 로그인으로 Vault에 자동 접속됩니다.
토큰은 **3일** 동안 유효하고, 워크스페이스를 재시작하면 갱신됩니다.
Vault 권한이 없는 계정이면 로그인만 건너뛰고, 워크스페이스는 그대로 쓸 수 있습니다.

```bash
vault token lookup                          # 현재 토큰 확인
vault kv list -mount=secret <path>          # 접근 가능한 secret 조회
```

### 🐙 GitHub 인증

Coder 계정 → **External Authentication**에서 GitHub이 Authenticated이면, 워크스페이스의 `git clone` / `git push`에 토큰이 자동으로 들어갑니다 (`GIT_ASKPASS`).
같은 토큰이 `GH_TOKEN` / `GITHUB_TOKEN` 환경변수로도 들어가서 `gh` CLI나 DevContainer로 넘길 수 있습니다. 이 값은 빌드 시점 스냅샷이라, 만료되면 워크스페이스를 Update하면 됩니다.
연결되어 있지 않으면 건너뛰고 워크스페이스는 그대로 시작됩니다. 그때는 private 저장소 clone이 실패합니다.

### 🧰 Git 설정

Coder 계정의 이름·이메일이 `git config --global user.name` / `user.email`로 들어갑니다.

### 📁 File Browser

대시보드의 **File Browser**로 `/home/coder`를 웹에서 보고, 파일을 올리거나 받을 수 있습니다.

### 🔄 Lifecycle Scripts

시작·종료 때 아래 스크립트가 실행됩니다. 로그는 같은 폴더의 `on-start.log`, `on-stop.log`에 남습니다.

| 경로                                         | 시점 |
| -------------------------------------------- | ---- |
| `~/Workspace/.lifecycle-scripts/on-start.sh` | 시작 |
| `~/Workspace/.lifecycle-scripts/on-stop.sh`  | 종료 |

### 🌐 Mesh Proxy

클러스터 안 서비스에 붙을 때만 쓰는 SOCKS5 프록시입니다.

```bash
curl --proxy "$CODER_MESH_SOCKS5_PROXY_URL" http://<mesh-internal-service>
```

### ⏱ Auto Stop / DevContainer Cleaner

10초마다 돌아갑니다. 로그는 Home에 남고, 비활성 타이머 상태는 `/tmp`에 있어서 워크스페이스를 재시작하면 다시 셉니다.

Auto Stop은 아래를 **활동**으로 봅니다. 가장 최근 활동 시각부터 대기 시간이 지나면 `coder stop`합니다.

- 실행 중인 Docker 컨테이너
- VS Code / Cursor `extensionHost`
- `/dev/pts` (Coder SSH·웹 터미널 PTY). 스크립트 자신의 TTY는 제외합니다
- Coder `last_used_at` (`coder list -o json`, IDE/SSH/JetBrains/웹 터미널 세션). 로그의 **사용시각**입니다

DevContainer Cleaner는 **그 컨테이너 안**만 봅니다. 워크스페이스 `last_used_at`은 쓰지 않습니다.

- 컨테이너 안 `extensionHost` (VS Code / Cursor가 그 DevContainer에 붙은 경우)
- 컨테이너 안 `/dev/pts` (`docker exec -it` / `devcontainer exec`)

로그 예:

```text
[유지]  ·  이유: IDE, 터미널  ·  터미널 pts/0  ·  Docker 0개  ·  IDE 연결  ·  사용시각 12초 전  ·  남은 10분 / 10분
[유지]  ·  sops_practice_devcon_workspace  ·  활성: IDE, 터미널  ·  터미널 pts/0  ·  남은 10분 / 10분
[유지]  ·  sops_practice_devcon_workspace  ·  활성: 없음  ·  터미널 없음  ·  남은 9분 50초 / 10분
```

| | 로그 | 상태 |
| --- | --- | --- |
| Auto Stop | `~/.auto-stop/<워크스페이스 시작시각>.log` (텍스트) | `/tmp/auto-stop-workspace/workspace-status.json` |
| DevContainer Cleaner | `~/.devcontainer-cleaner/<워크스페이스 시작시각>.log` (텍스트) | `/tmp/devcontainer-cleaner/disconnected-devcontainers.json` |

```bash
tail -f ~/.auto-stop/*.log

# 수동 재현 (nvm이 켜진 셸)
export WAIT_SECONDS=600
export LOG_DIR="$HOME/.auto-stop"
export STATE_DIR=/tmp/auto-stop-workspace
node /tmp/auto-stop-workspace/autostop-workspace.js
```

## 💡 팁

- Node.js(NVM)와 Docker는 시작하자마자 바로 쓸 수 있습니다. (`docker ps`)
- 셸 설정을 초기화하려면 `~/.bashrc`를 지우고 워크스페이스를 재시작하세요. 기본 설정이 다시 복사됩니다.

## 변경 사항

### 2026-08-14

- **Auto Stop / DevContainer Cleaner**: 로그는 `~/.auto-stop`, `~/.devcontainer-cleaner`에서 `tail -f`로 볼 수 있습니다. 워크스페이스를 재시작하면 타이머가 다시 시작합니다.
- **DevContainer Cleaner**: compose로 묶인 컨테이너도 같이 끄고, `devcontainer-cleaner.skip=true` 라벨은 건너뜁니다.

### 2026-08-13

- **GitHub External Auth 선택 주입**: 계정에 GitHub이 연결되어 있으면 git 자격증명을 넣고, 없으면 건너뜁니다.
- **GH_TOKEN / GITHUB_TOKEN 주입**: External Auth 토큰을 에이전트 env로 넣어 `gh` CLI·DevContainer에서 사용할 수 있게 합니다.
- **HDD Data 스토리지 추가**: `/home/coder/data`에 HDD 영구 볼륨을 마운트합니다. Home/Docker는 SSD, 대용량 데이터는 HDD로 분리합니다.
