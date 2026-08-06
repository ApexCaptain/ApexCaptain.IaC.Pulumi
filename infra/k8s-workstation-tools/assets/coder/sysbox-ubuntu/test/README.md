# Ubuntu on Sysbox (Test)

[Sysbox](https://github.com/nestybox/sysbox) 런타임으로 동작하는 Ubuntu 워크스페이스입니다.
일반 컨테이너와 달리 워크스페이스 안에서 **Docker(DinD)와 DevContainer**를 그대로 사용할 수 있습니다.

## 주요 파라미터

| 파라미터 | 설명 |
| --- | --- |
| CPU / Memory | 워크스페이스에 할당할 최대 리소스입니다. 워크스페이스 재시작 없이 변경할 수 있습니다. |
| 홈 디스크 사이즈 | `/home/coder` 영구 볼륨 크기입니다. **확장만 가능**하며 줄일 수 없습니다. |
| Docker 디스크 사이즈 | Docker 이미지·컨테이너가 저장되는 볼륨 크기입니다. 역시 확장만 가능합니다. |
| IDE | VS Code(Desktop/Web), Cursor, Terminal 중 사용할 항목을 선택합니다. 복수 선택 가능합니다. |
| Fuse Device 수 | Rclone 등으로 Google Drive, OneDrive 등을 마운트할 때 필요한 FUSE 디바이스 수입니다. 사용하지 않으면 0으로 두세요. |
| Auto Stop Workspace | 비활성 상태가 지속되면 워크스페이스를 자동 종료합니다. 내부에 Running 상태의 컨테이너가 있으면 동작하지 않습니다. |
| DevContainer Cleaner | 일정 시간 사용하지 않은 DevContainer를 자동으로 종료(Stop)합니다. 컨테이너에 `devcontainer-cleaner.skip=true` 라벨을 붙이면 제외됩니다. |

## 기본 제공 기능

### 🔐 Vault 자동 로그인

워크스페이스가 시작되면 Coder 로그인 세션(Authentik)을 그대로 사용해 **Vault에 자동 로그인**됩니다.

```bash
vault token lookup                          # 현재 토큰 확인
vault kv list -mount=secret <path>          # 접근 가능한 secret 조회
```

- 토큰 TTL은 **3일**이며, 워크스페이스를 재시작하면 갱신됩니다.
- Vault 권한이 없는 계정이어도 워크스페이스 사용에는 영향이 없습니다. (로그인만 건너뜁니다)

### 🐙 GitHub 인증

Private 저장소를 `git clone` / `git push` 하면 인증 URL이 안내됩니다.
최초 1회 브라우저에서 승인하면 이후에는 자동으로 인증됩니다.

### 🧰 Git 설정

Coder 계정의 이름·이메일이 `git config --global user.name / user.email` 로 자동 설정됩니다.
워크스페이스 파라미터에서 이름을 직접 지정할 수도 있습니다.

### 📁 File Browser

워크스페이스 대시보드의 **File Browser** 앱으로 홈 디렉토리(`/home/coder`)를 웹에서 탐색하고,
파일을 업로드/다운로드할 수 있습니다.

### 🔄 Lifecycle Scripts

워크스페이스 시작/종료 시 실행되는 사용자 정의 스크립트입니다. 원하는 초기화 작업을 자유롭게 추가하세요.

| 경로 | 실행 시점 |
| --- | --- |
| `~/Workspace/.lifecycle-scripts/on-start.sh` | 워크스페이스 시작 시 |
| `~/Workspace/.lifecycle-scripts/on-stop.sh` | 워크스페이스 종료 시 |

실행 로그는 같은 디렉토리의 `on-start.log`, `on-stop.log`에 저장됩니다.

### 🌐 Mesh Proxy (선택)

클러스터 메시 내부 서비스에 접근해야 할 때만 사용하는 SOCKS5 프록시입니다.
아래 환경 변수가 미리 주입되어 있습니다.

```bash
curl --proxy "$CODER_MESH_SOCKS5_PROXY_URL" http://<mesh-internal-service>
```

## 팁

- Node.js(NVM)가 기본 설치되어 있습니다.
- Docker 데몬은 워크스페이스 시작 시 자동으로 실행됩니다. (`docker ps` 바로 사용 가능)
- 셸 설정을 초기화하고 싶다면 `~/.bashrc`를 삭제 후 워크스페이스를 재시작하세요. 기본 설정이 다시 복사됩니다.
