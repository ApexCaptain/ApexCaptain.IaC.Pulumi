# DevContainer마다 Claude Remote Control 서버를 백그라운드로 상시 실행

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-23 |
| **영역** | DevContainer (`.devcontainer/`), Claude Code `claude remote-control` (v2.1.309 기준) |
| **관련 코드** | `.devcontainer/commands/common/startClaudeRemoteControl.sh`, `.devcontainer/commands/postStartCommand.sh`, `.devcontainer/commands/initializeCommand.sh`, `.devcontainer/devcontainer.json`, `.devcontainer/docker-compose.dev.yml` |
| **상태** | **해결** — 이 레포 적용·rebuild 후 재접속 확인. 다른 레포 DevContainer는 아래 체크리스트로 이식 |
| **해결일** | 2026-10-23 |

## 해결 요약

DevContainer 여러 개를 동시에 띄우고, 컨테이너마다 `claude remote-control` 서버 1개를 tmux 안에서 상시 실행한다. 폰(Claude 앱 **Code** 탭)·claude.ai/code에서 레포 이름으로 구분해 접속한다. 호스트 환경변수 `ENABLE_CLAUDE_RC=true`일 때만 켜진다(opt-in).

이식 시 함정 두 가지: `-c`(단일 세션 모드)를 쓰지 말 것, compose에 `init: true`(좀비 reap)를 넣을 것.

## 배경

스마트폰·웹에서 각 DevContainer의 Claude 세션을 이어서 쓰고 싶다. Remote Control 서버 모드(`claude remote-control`)는 한 디렉토리에서 여러 세션을 받는 상주 프로세스라 용도에 맞다. 실제 실행은 로컬 컨테이너에서 하고, 앱은 리모컨이다.

## 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 프로세스 유지 | tmux 세션 `claude-rc` | lifecycle 스크립트 종료와 무관하게 유지, `tmux attach -t claude-rc`로 상태 확인 |
| 세션 이름 | `--name "$(basename "$PWD")"` | 기본 접두사는 hostname(컨테이너 해시)이라 앱 목록에서 구분 불가 |
| 권한 모드 | `--permission-mode auto` | 폰 승인 피로 감소. 인프라 레포라 `bypassPermissions`는 쓰지 않음 |
| spawn 모드 | `--spawn same-dir` | env·`node_modules`·`repos/gitops` 등 gitignore 로컬 셋업을 그대로 사용. worktree는 이 레포에서 셋업 비용 큼 |
| 활성화 | opt-in, 호스트 `ENABLE_CLAUDE_RC=true` | devcontainer 설정은 커밋되므로 다른 환경에서 자동 실행 방지 |
| 인증 | 호스트 `~/.claude`, `~/.claude.json` bind mount (기존) | rebuild 후에도 로그인·세션 기록 유지. API key·`setup-token` 토큰은 Remote Control 불가 |

## 구현

- `devcontainer.json`: apt-get-packages feature에 `tmux` 추가
- `initializeCommand.sh` (호스트에서 실행): `.devcontainer/.env`에 `ENABLE_CLAUDE_RC=${ENABLE_CLAUDE_RC:-false}` 기록
- `docker-compose.dev.yml`: `init: true`
- `postStartCommand.sh`: `synchronizeProject.sh`(claude 설치 포함) 다음에 `startClaudeRemoteControl.sh` 호출
- `startClaudeRemoteControl.sh`: 아래 조건을 모두 통과하면 실행
  - `ENABLE_CLAUDE_RC=true`, tmux 존재, `claude auth status --json`의 `loggedIn: true`, `claude-rc` tmux 세션 없음
  - `tmux new-session -d -s claude-rc "claude remote-control --spawn same-dir --name <repo> --permission-mode auto; echo ...; exec bash"`
  - `exec bash`는 종료 후 attach해서 에러를 보기 위함

## 문제와 원인

| # | 증상 | 원인 | 조치 |
|---|---|---|---|
| 1 | 최초 실행 시 앱에 안 뜸 | `--spawn` 미지정이면 최초 실행에서 `Spawn mode for this project: Choose [1/2]` 대화형 프롬프트로 멈춤 | `--spawn same-dir` 명시 |
| 2 | 앱에서 못 찾음 | 앱 기본 채팅 목록이 아니라 **Code** 탭 세션 목록에 나옴(컴퓨터 아이콘 + 초록 점) | 사용법 문제. 서버 쪽은 정상 |
| 3 | rebuild 뒤 재접속은 됐으나 약 18분 후 "연결 끊김" | 재접속용으로 쓴 `claude remote-control -c`는 시작 세션 하나만 되살리는 **단일 세션 모드**("Single session · exits when complete")라 그 세션이 끝나면 프로세스 종료 | `-c` 제거. 옵션 없는 `claude remote-control`도 서버 중지 후 ~4h 내면 그 서버의 세션을 **전부** 되살리고 서버 모드 유지 |
| 4 | 재시작 시 `This folder is already served by a terminal claude remote-control on this device` | PID 1이 `sleep infinity`라 좀비를 reap하지 않음. 종료된 claude가 `<defunct>`로 남아 pid 생존 판정 | compose `init: true` (tini가 PID 1) |

미확정: 3번 종료 때 tmux 서버까지 사라진 이유. `exec bash`가 있으면 tmux는 남아야 한다. 같은 시각 attach 후 `Ctrl+C`/`exit`로 나왔다면 설명된다(가설). 빠져나올 때는 `Ctrl+b` → `d`.

## 동작 메모

- 세션 기록: `~/.claude/projects/<경로>/bridge-pointer.json`(디렉토리별 마지막 세션·환경 ID), 대화는 같은 폴더 `*.jsonl`. 호스트 mount라 rebuild에도 유지
- 4시간 = 서버가 **꺼진 뒤** 같은 세션으로 다시 붙을 수 있는 유예. 실행 중엔 리셋 없음. 지나면 새 세션, 이전 대화는 앱 목록·로컬 기록에 남음(`claude --resume`)
- 폰·웹에서 되는 명령: `/compact`, `/clear`, `/context` 등. `/resume`, `/plugin`은 로컬 CLI 전용
- 서버 모드는 네트워크 단절 ~10분이면 종료. 호스트 절전·컨테이너 중지 시 세션 오프라인
- 같은 레포로 컨테이너 2개를 동시에 띄우면 같은 디렉토리 기록을 공유해 충돌 가능. 레포당 컨테이너 1개 전제
- 참고: https://code.claude.com/docs/en/remote-control

## 다른 DevContainer 이식 체크리스트

- [ ] `~/.claude`, `~/.claude.json` 호스트 bind mount 확인 (없으면 rebuild마다 재로그인·기록 유실)
- [ ] compose 서비스에 `init: true` (또는 PID 1이 좀비를 reap하는지 `ps -p 1 -o cmd`로 확인)
- [ ] tmux 설치
- [ ] `ENABLE_CLAUDE_RC`를 호스트 → 컨테이너 env로 전달 (initializeCommand가 `.env`를 생성하는 구조면 거기에)
- [ ] `startClaudeRemoteControl.sh` 복사, claude 설치 이후 시점의 postStart에서 호출
- [ ] `--spawn` 명시, `-c` 사용 금지
- [ ] 레포 성격에 맞게 `--permission-mode` 재검토
- [ ] rebuild 후 `tmux attach -t claude-rc`로 `Connected` 확인, 앱 Code 탭에서 레포 이름 확인

호스트 `ENABLE_CLAUDE_RC=true`는 `~/.profile`에 export (GUI에서 연 에디터에도 전달되도록, 재로그인 필요).

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-23 | 등록. tmux·opt-in·same-dir·auto 권한 결정, 스크립트 구현 |
| 2026-10-23 | 최초 실행이 spawn 모드 프롬프트에서 멈춤 → `--spawn same-dir` 명시 |
| 2026-10-23 | rebuild 후 `-c`로 같은 세션 재접속 성공, 약 18분 뒤 연결 끊김 |
| 2026-10-23 | `-c` 단일 세션 모드·좀비 pid가 원인으로 확인 → `-c` 제거, compose `init: true` |
| 2026-10-23 | 재 rebuild 후 정상 동작 확인. 해결 |
