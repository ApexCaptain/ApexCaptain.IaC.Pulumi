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
| Auto Stop            | 오래 안 쓰면 워크스페이스를 끕니다. 실행 중인 컨테이너가 있으면 동작하지 않습니다.                     |
| DevContainer Cleaner | 안 쓰는 DevContainer를 자동으로 종료합니다. `devcontainer-cleaner.skip=true` 라벨이 있으면 건너뜁니다. |

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

## 💡 팁

- Node.js(NVM)와 Docker는 시작하자마자 바로 쓸 수 있습니다. (`docker ps`)
- 셸 설정을 초기화하려면 `~/.bashrc`를 지우고 워크스페이스를 재시작하세요. 기본 설정이 다시 복사됩니다.

## 변경 사항

### 2026-08-13

- **GitHub External Auth 선택 주입**: 계정에 GitHub이 연결되어 있으면 git 자격증명을 넣고, 없으면 건너뜁니다.
- **GH_TOKEN / GITHUB_TOKEN 주입**: External Auth 토큰을 에이전트 env로 넣어 `gh` CLI·DevContainer에서 사용할 수 있게 합니다.
- **HDD Data 스토리지 추가**: `/home/coder/data`에 HDD 영구 볼륨을 마운트합니다. Home/Docker는 SSD, 대용량 데이터는 HDD로 분리합니다.
