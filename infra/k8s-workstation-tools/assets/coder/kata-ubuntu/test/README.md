# Ubuntu on Kata

[Kata Containers](https://katacontainers.io/) 경량 VM 위에서 도는 Ubuntu 워크스페이스입니다.
VM 안에 커널이 따로 있어 **Docker**와 **DevContainer**를 일반 서버처럼 쓸 수 있습니다.

### Ubuntu on Sysbox와 다른 점

- **Mesh Proxy가 없습니다.** 워크스페이스에 Istio sidecar가 붙어 클러스터 안 서비스(mTLS STRICT 포함)를 바로 호출합니다. DevContainer(기본 bridge·compose 네트워크)도 같습니다.
- **File Browser가 없습니다.** 파일 업로드·다운로드는 VS Code 탐색기를 쓰세요 (Kata 루트 파일시스템에서 설치 스크립트의 `setcap`이 실패).
- **Fuse Device 수를 고르지 않습니다.** VM 안 `/dev/fuse`를 시작할 때 만들어 항상 쓸 수 있습니다.
- **Rclone 마운트를 DevContainer에 바로 넘깁니다.** Sysbox처럼 unison으로 복사할 필요가 없습니다.
- 홈(`/home/coder`)과 Docker 디스크는 블록 장치로 붙어 첫 기동에 ext4로 포맷됩니다. 작은 파일 I/O가 빠릅니다. Data(`~/data`, HDD)는 virtiofs라 큰 파일 위주로 쓰세요.
- 메모리는 선택한 값 전체를 예약합니다 (Sysbox는 1/4). VM이 페이지 캐시로 메모리를 잘 돌려주지 않아 실사용에 맞췄습니다.

## ⚙️ 파라미터

| 파라미터             | 설명                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| CPU / Memory         | 워크스페이스에 줄 최대 리소스입니다. CPU **2–12 코어**, 메모리 **4–20 GB**. 재시작 없이 바꿀 수 있습니다. |
| (SSD) Home           | `/home/coder` 홈 디렉터리입니다. 10–100 GB, **확장만 가능**합니다.                                     |
| (SSD) Docker         | Docker 이미지·컨테이너용입니다. `/var/lib/docker`, 10–100 GB, 확장만 가능합니다.                       |
| (HDD) Data           | 대용량 파일용입니다. `/home/coder/data`, 10–300 GB, 확장만 가능합니다.                                 |
| IDE                  | VS Code(Desktop/Web), Cursor, Terminal 중 고릅니다. 여러 개 선택할 수 있습니다.                        |
| Auto Stop            | IDE(VS Code/Cursor)·SSH·웹 터미널이 없고 실행 중인 컨테이너도 없으면 워크스페이스를 끕니다. 로그는 `~/.auto-stop/<시작시각>.log`입니다. |
| DevContainer Cleaner | 그 컨테이너에 IDE·터미널이 없으면 종료합니다. `devcontainer-cleaner.skip=true` 라벨은 건너뜁니다. 로그는 `~/.devcontainer-cleaner/<시작시각>.log`입니다. |
| Ubuntu APT Mirror    | apt 미러입니다. Kakao(기본) / KAIST / Ubuntu Official. 패키지는 사용자 PC가 아니라 클러스터에서 받습니다. |

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

### 🔄 Lifecycle Scripts

시작·종료 때 아래 스크립트가 실행됩니다. 로그는 같은 폴더의 `on-start.log`, `on-stop.log`에 남습니다.

| 경로                                         | 시점 |
| -------------------------------------------- | ---- |
| `~/Workspace/.lifecycle-scripts/on-start.sh` | 시작 |
| `~/Workspace/.lifecycle-scripts/on-stop.sh`  | 종료 |

### ☁️ Rclone 마운트

Google Drive 같은 rclone remote를 `~/mnt/<이름>`에 마운트합니다. 자격 증명과 목록은 Home에 있어 재시작해도 유지되고, 템플릿·Coder에는 남지 않습니다.

1. remote 등록 (처음 한 번): `rclone config`
   - Google Drive 등 브라우저 인증: VS Code Desktop/Cursor로 접속했으면 auto config `y` (포트 포워딩으로 인증). 웹 터미널만 쓰면 `n` → 로컬 PC에서 `rclone authorize "drive"` → 나온 토큰 붙여넣기
   - 확인: `rclone lsd <remote>:`
2. `~/.config/rclone/mounts`에 한 줄 추가: `<이름> <remote:경로> [rclone mount 옵션...]`
   ```text
   gdrive-secrets gdrive:secrets
   gdrive-photos  gdrive:Photos --read-only
   ```
3. `rclone-mounts` 실행 (안 해도 30초 안에 반영). 줄을 지우면 해제됩니다.

```bash
rclone-mounts status -v      # 항목별 상태
tail ~/.cache/rclone-mounts/<이름>.log
```

대시보드 **Rclone Mounts**에 정상 수/항목 수가 보입니다. rclone이 죽으면 다시 마운트하고, 실패한 항목은 5분마다 다시 시도합니다.
기본 옵션은 `--vfs-cache-mode writes --dir-cache-time 1m --poll-interval 1m`이고, 캐시는 `~/.cache/rclone`에 있습니다.

DevContainer에서 쓰려면 `devcontainer.json`에 한 번 넣습니다. 나중에 추가한 마운트도 자동으로 보입니다.

```json
"mounts": ["source=/home/coder/mnt,target=/mnt/rclone,type=bind,bind-propagation=rslave"]
```

다른 경로에서 쓰려면 심볼릭 링크를 거세요 (`ln -s ~/mnt/gdrive-secrets ~/Workspace/secrets`). 네트워크 마운트라 remote가 느리거나 끊기면 그 경로 접근도 멈출 수 있습니다.

### 🌐 클러스터 서비스 호출

Istio sidecar가 붙어 있어 프록시 설정 없이 바로 호출합니다. DevContainer 안에서도 같습니다.

```bash
curl http://<service>.<namespace>.svc.cluster.local
```

`--network=host`는 필요 없습니다. 워크스페이스가 시작하면서 Docker 브리지(`docker0`, `br-*`) 트래픽을 sidecar로 보내는 iptables 규칙을 넣습니다.

### ⏱ Auto Stop / DevContainer Cleaner

30초마다 돌아갑니다. 로그는 Home에 남고, **10일 동안 갱신되지 않은 로그는 자동으로 지웁니다.** 비활성 타이머 상태는 `/tmp`에 있어서 워크스페이스를 재시작하면 다시 셉니다.

Coder 대시보드에는 **Auto Stop** 남은 시간과 **활동**(IDE · 터미널 · Docker)이 10초마다 갱신됩니다. Auto Stop을 끈 워크스페이스는 `꺼짐`으로 표시됩니다.

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

### 2026-10-31

- Rclone 마운트를 추가했습니다 (`~/.config/rclone/mounts` → `~/mnt/<이름>`, DevContainer에서도 사용).
- CPU·RAM 메트릭이 VM 전체가 아니라 워크스페이스에 준 값 기준으로 나옵니다.
- File Browser를 뺐습니다 (Kata에서 설치 실패). Docker Disk 메트릭은 디스크 마운트 전 "준비 중"으로 표시합니다.
- 전용 네임스페이스(`coder-kata-ubuntu-test`)로 옮겼습니다. Mesh Proxy를 빼고 Istio sidecar를 붙였습니다. 클러스터 서비스를 워크스페이스·DevContainer에서 바로 호출합니다.
- 홈 디스크를 블록 장치로 바꿨습니다 (virtiofs 대비 `pnpm install` 약 4배, 삭제 약 17배 빠름). 메모리 request를 limit과 같게 했습니다.
- Ubuntu on Sysbox (Test)에서 분리해 새로 만들었습니다. 런타임 Kata, Docker 디스크 블록 장치, lxcfs 제거, Fuse Device 수 파라미터 대신 VM 안 `/dev/fuse` 상시 제공.
