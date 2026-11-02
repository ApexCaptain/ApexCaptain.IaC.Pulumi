# Kata 워크스페이스 기동 후 rclone 바이너리 없음 → `gdrive-secrets` 마운트 실패

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-11-02 |
| **우선순위** | 높음 — Home의 rclone remote(시크릿)가 안 붙으면 devContainer initialize가 막힘 |
| **영역** | `infra/k8s-workstation-tools/assets/coder/kata-ubuntu` (`main`·`test` 동일) |
| **관련 코드** | `scripts.tf` `coder_script.rclone-mounts`, `locals.tf` `rclone_version`, `assets/files/rclone-mounts.sh`, `agent.tf` metadata `4_rclone_mounts` |
| **선행** | [Sysbox 교체](../active/2026-10-24-sysbox-runtime-replacement.md) 2026-10-31 — rclone 마운트 도입, 같은 날 `install-devcontainers-cli`와 rclone 스크립트의 **apt 락 경쟁**을 이미 한 번 고침 |
| **상태** | **해결** — 2차 수정 배포·라이브 재검증 통과. 설치 실패 시 `exit 1` 표시는 로컬 테스트로만 확인(사용자 판단으로 종료) |
| **해결일** | 2026-11-02 |
| **관측 워크스페이스** | Coder 위 Kata Ubuntu production 워크스페이스. 1차 장애 13:13, 1차 수정 검증 15:13, 2차 수정 검증 15:35 |

## 해결 요약

- 원인: 기동 시 rclone `.deb` 다운로드가 curl exit 92(HTTP/2 INTERNAL_ERROR)로 잘렸고, 스크립트가 설치 실패를 무시한 채 헬퍼만 깔아 `command not found`.
- 1차 수정: `rclone-mounts install`(재시도 `--retry-all-errors`·`dpkg-deb` 검증·GitHub fallback·버전 assert), rclone 없으면 sync 안 함, 루프 재설치, 실패 시 스크립트 `exit 1`, 설치 로그 `sync.log`.
- 1차 회귀: `export RCLONE_VERSION`이 rclone `--version` 플래그로 매핑돼 마운트 실패. 2차에서 버전을 인자(`install <버전>`)로 넘기도록 수정.
- 검증: 2026-11-02 15:35 restart에서 기동 설치·마운트 ✅, `apt-get remove` 후 루프 재설치 ✅, Rclone Mounts 스크립트 `exit_code=0`.
- 남은 것(이 레포 할 일 아님/수용): 설치 실패 경로의 라이브 증명, 이미지에 rclone 굽기·apt 직렬화는 필요 시 별도 이슈.

이 문서는 워크스페이스 안에서 관측한 장애를 **템플릿을 담당하는 에이전트**에게 넘기기 위한 인수인계다. 자격 증명(`rclone.conf` 토큰)은 넣지 않았다.

## 한 줄 요약

**원래 장애:** 마운트/FUSE/Google Drive 인증 문제가 아니다. 기동 시 rclone `.deb` 다운로드가 HTTP/2로 잘린 뒤 스크립트가 설치 실패를 무시했고, 헬퍼만 깔려 `rclone: command not found`가 났다.

**중간 (15:13):** 그 구멍은 메웠지만 `export RCLONE_VERSION=1.75.2`가 rclone `--version`과 충돌해 마운트가 다시 ❌.

**지금 (15:35 restart):** 버전을 인자 `rclone-mounts install 1.75.2`로 넘기도록 고친 뒤, 기동 시 `설치 완료` + `status -v` ✅. 바이너리를 지워도 루프가 다시 깐다.

## 사용자에게 보인 증상

```text
$ rclone-mounts status -v
❌ gdrive-secrets  /home/coder/mnt/gdrive-secrets ← gdrive:secrets  (/home/coder/.cache/rclone-mounts/gdrive-secrets.log)
```

대시보드 **Rclone Mounts**는 `rclone-mounts status`라서 `0/1` 또는 실패 카운트만 보인다. `agent.tf`는 오류를 `2>/dev/null`로 삼키고 헬퍼가 없으면 `'준비 중'`으로 폴백한다.

## 타임라인 (워크스페이스 로컬, KST)

| 시각 | 사건 |
|------|------|
| 2026-11-01 22:20:02 | 기존 `rclone mount` SIGTERM, unmount (`gdrive-secrets.log`) — 워크스페이스 정지/재시작으로 보임 |
| 2026-11-02 10:09:29 | 재기동 후 마운트 정상 (vfs cache 정리 로그) → **이 시점에는 rclone이 있었다** |
| 2026-11-02 10:47:05 | 다시 SIGTERM, unmount |
| 2026-11-02 13:13 전후 | 새 기동. `/var/lib/apt/lists/lock`, `/var/lib/dpkg/lock` mtime이 이 시각. `coder_script.rclone-mounts`(PID 2798)와 `run-dockerd`(PID 200) 동시 기동 |
| 2026-11-02 13:18:52 | 첫 `rclone-mounts sync` 실패. `sync.log`에 `rclone: command not found` 두 줄 (스크립트 50번째 줄 = `rclone mount ...`) |
| 2026-11-02 13:21 관측 | PID 2798은 이미 백그라운드 루프(`sleep 30` → `rclone-mounts sync --auto`). fuse3는 설치됨(`ii fuse3 3.18.2-1`). **rclone 패키지/바이너리 없음** (`dpkg -l rclone` 없음, `/usr/bin/rclone` 없음, `/tmp/*.deb` 없음) |
| 2026-11-02 13:21 | 같은 워크스페이스에서 수동으로 공식 .deb 설치 후 `rclone-mounts sync` → ✅ 마운트 복구 (`rclone v1.75.2`) |

즉 **이미지에 rclone이 없고, 매 기동마다 `coder_script`가 깔아야 하는데 한 번의 기동에서 그 설치만 빠졌다.** Home PVC의 `~/.config/rclone/{rclone.conf,mounts}`는 살아 있어서 목록/자격 증명은 있었다.

## 재현된 실패 로그

`~/.cache/rclone-mounts/sync.log` (스크립트가 `: >`로 기동 시 truncate):

```text
2026-11-02 13:18:52 실패: gdrive-secrets ← gdrive:secrets (/home/coder/.cache/rclone-mounts/gdrive-secrets.log)
    2026/11/02 10:47:05 INFO  : Exiting...
    /usr/local/bin/rclone-mounts: line 50: rclone: command not found
    /usr/local/bin/rclone-mounts: line 50: rclone: command not found
```

`gdrive-secrets.log` 끝:

```text
2026/11/02 10:47:05 INFO  : Signal received: terminated
2026/11/02 10:47:05 NOTICE: /home/coder/mnt/gdrive-secrets: Unmounted rclone mount
2026/11/02 10:47:05 INFO  : Exiting...
/usr/local/bin/rclone-mounts: line 50: rclone: command not found
/usr/local/bin/rclone-mounts: line 50: rclone: command not found
```

`command not found`가 마운트 로그에 붙은 이유는 `do_mount`가 rclone stdout/stderr를 `$LOG_DIR/$name.log`로 리다이렉트하기 때문이다.

실패 스탬프: `/tmp/rclone-mounts/.failed/gdrive-secrets` (mtime 13:18, 내용 = mounts 한 줄). `/tmp`라서 Pod 재시작 때 사라진다.

## 원인 확정 (2026-11-02, Coder 스크립트 로그)

Kata Pod `dev` 컨테이너의 `/tmp/coder-script-de543e51-….log`(Rclone Mounts 스크립트 출력)로 확정했다. **apt 락이 아니다.** 후보 1·3이 맞다.

```text
Setting up fuse3 (3.18.2-1) ...
curl: (92) HTTP/2 stream 1 was not closed cleanly: INTERNAL_ERROR (err 2)
E: Invalid archive member header
E: Could not read meta data from /tmp/tmp.RWlZ4ersYp.deb
2026-11-02 13:13:52 실패: gdrive-secrets ← gdrive:secrets (...)
    /usr/local/bin/rclone-mounts: line 50: rclone: command not found
```

- `downloads.rclone.org` 다운로드가 HTTP/2 스트림 중간에 끊겨 잘린 `.deb`가 남았고, apt가 그 파일을 못 읽었다. 스크립트는 계속 진행했다.
- 첫 sync 실패는 **13:13:52**(스크립트 로그). `sync.log`의 13:18:52는 300초 백오프 뒤 첫 `--auto` 재시도다. 위 타임라인의 "첫 실패 13:18:52"는 이것으로 정정한다.
- 끊긴 원인(rclone CDN 쪽인지, 기동 직후 Istio sidecar 경로인지)은 **미확인 가설**이다. 이 Pod는 sidecar가 붙어 있다.
- 수정 방향 2 보충: `curl --retry`만으로는 부족하다. exit 92는 curl 기본 재시도 대상(timeout·5xx 등)이 아니다. `--retry-all-errors`(또는 `--http1.1`)와 다운로드 후 `dpkg-deb -I`로 아카이브 검증이 필요하다.

## 적용 (2026-11-02, 1차 — 작성 당시 미배포, 이후 배포됨)

`main`·`test` 동일. 해야 할 것 1·2·3·4·7 반영. 5(apt flock)·6(이미지 굽기)은 안 함 — 원인이 apt 락이 아니었고, 이미지는 `codercom/enterprise-base` 그대로라 별도 이미지 도입이 필요하다. 필요하면 후속 이슈로 분리.

- `assets/files/rclone-mounts.sh`
  - `install` 서브커맨드: 버전 같으면 건너뜀. `curl --retry 3 --retry-all-errors` → `dpkg-deb --info` 검증, 실패 시 GitHub release fallback. 설치 후 `rclone version` 재확인, 실패면 exit 1
  - `sync`: 목록이 있는데 rclone이 없으면 마운트 시도 안 함(`.failed` 백오프 안 남김), exit 1
  - `status`: rclone 없으면 `rclone 없음`(대시보드) / `-v`는 `❌ rclone 미설치`
- `scripts.tf` `coder_script.rclone-mounts`
  - `sync.log`를 맨 앞에서 비우고, 설치 출력은 스크립트 로그와 `sync.log`에 같이 남김(`tee`)
  - 설치 성공 때만 첫 `sync`. fuse3/rclone 설치 실패 시 `exit 1`로 Coder 스크립트 실패 표시
  - 루프: `command -v rclone` 없으면 `rclone-mounts install` 재시도 후 `sync --auto`
- `README.md` 사용법·변경 사항

검증(당시): `terraform fmt -check`, `terraform validate`(main 복사본), `bash -n`. 임시 HOME으로 실패 경로(버전 없음, 404 두 URL, rclone 없는 sync/status) 확인. 두 URL 실다운로드 + `dpkg-deb` 1.75.2 확인. 잘린 파일은 `dpkg-deb` rc=2로 걸러짐. **라이브 stop/start는 이 시점에 안 했다.**

이 수정은 이후 배포되어 15:13 restart에서 새 스크립트가 실제로 돌았다. 결과는 아래 “restart 실검증 실패”.

## restart 실검증 실패 (2026-11-02 15:13 KST)

담당 에이전트가 배포 후 제시한 확인 기준:

| 기준 | 라이브 결과 |
|------|------|
| restart 후 `rclone v1.75.2` + `rclone-mounts status -v` ✅ | **실패.** `dpkg -l rclone`은 `1.75.2`. `status -v`는 ❌, `/proc/self/mountinfo`에 gdrive-secrets 없음, `rclone mount` 프로세스 없음 |
| `head ~/.cache/rclone-mounts/sync.log`에 `설치 시작` / `설치 완료` | **일부만.** `15:13:40 rclone v1.75.2 설치 시작`은 있음. **`설치 완료` 없음** |
| `sudo apt-get remove -y rclone` 후 ~40초, 루프가 다시 설치 | **미실시.** 첫 기준이 이미 실패라 바이너리를 지우면 더 나빠짐 |

`sync.log` (기동 시 truncate된 새 로그, 15:13 기동분):

```text
2026-11-02 15:13:40 rclone v1.75.2 설치 시작
... Setting up rclone (1.75.2) ...
2026-11-02 15:13:47 설치 실패: 설치 후 버전 불일치 ()
2026-11-02 15:14:17 실패: gdrive-secrets ← gdrive:secrets (/home/coder/.cache/rclone-mounts/gdrive-secrets.log)
    2026/11/02 15:13:01 NOTICE: /home/coder/mnt/gdrive-secrets: Unmounted rclone mount
    2026/11/02 15:14:17 CRITICAL: Invalid value when setting --version from environment variable RCLONE_VERSION="1.75.2": invalid argument "1.75.2" for "--version" flag: strconv.ParseBool: parsing "1.75.2": invalid syntax
```

apt는 패키지를 깔았다. 그 직후 `cmd_install`의 `rclone version` assert와 `rclone mount`가 둘 다 죽은 것이다.

### 원인: `RCLONE_*` 환경변수 충돌

`scripts.tf`가 헬퍼에 버전을 넘기려고 `export RCLONE_VERSION=${local.rclone_version}` 를 넣었다. rclone은 `RCLONE_<FLAG>`를 CLI 플래그로 매핑하므로 이게 `--version=1.75.2`가 된다. `--version`은 bool이라 파싱에 실패한다.

워크스페이스에서 재현 (같은 바이너리, env만 다름):

```text
$ rclone version
rclone v1.75.2

$ RCLONE_VERSION=1.75.2 rclone version
CRITICAL: Invalid value when setting --version from environment variable RCLONE_VERSION="1.75.2":
invalid argument "1.75.2" for "--version" flag: strconv.ParseBool: parsing "1.75.2": invalid syntax
```

그래서 `$(rclone version 2>/dev/null | head -n 1)` 이 빈 문자열 → 로그가 `버전 불일치 ()`. 백그라운드 루프도 `RCLONE_VERSION`을 상속한 채 `sync --auto`를 돌리므로, 패키지가 있어도 마운트는 계속 실패한다.

### 수정 방향 (2차)

- rclone 프로세스에 `RCLONE_` 접두사 환경변수를 넘기지 말 것. 헬퍼 전용 이름은 예를 들어 `RCLONE_MOUNTS_VERSION`. `cmd_install`의 `want`도 같이 바꾼다.
- `scripts.tf`의 `export RCLONE_VERSION=...` 제거.
- 고친 뒤 다시 stop/start. 그때 `설치 완료`와 `status -v` ✅가 나와야 한다. `apt-get remove` 루프 재설치 확인은 마운트가 ✅인 다음에만.

### 적용 (2차, 2026-11-02 15:20, 미배포)

`main`·`test` 동일. 환경변수 대신 **인자**로 버전을 넘긴다. 헬퍼 전용 env 이름(`RCLONE_MOUNTS_VERSION`)도 안 쓴다 — rclone 자식 프로세스로 새는 경로 자체를 없앰.

- `rclone-mounts.sh`: `rclone-mounts install <버전>`. `cmd_install`은 `$1`만 본다. 인자 없으면 exit 1
- `scripts.tf`: `export RCLONE_VERSION=...` 제거 → export 안 한 셸 변수 `rclone_version`. 첫 설치·루프 둘 다 `rclone-mounts install "$rclone_version"`
- 헬퍼의 다른 `RCLONE_*`: `RCLONE_CONF`는 export 안 된 셸 변수라 rclone으로 안 넘어감 (확인)

검증: `bash -n`, `terraform fmt -check`. 라이브 Pod(15:13 기동분, rclone 1.75.2 설치 상태)에 새 헬퍼를 `/tmp`로 복사해 실행 — `install 1.75.2` rc=0(버전 체크 통과, 1차에서 깨졌던 경로), `install`(인자 없음) rc=1, `status -v` ✅. 새로 설치하는 경로(apt 후 assert)는 같은 버전 체크를 쓰지만 라이브로는 stop/start에서 확인한다.

1차 검증 누락 원인: 로컬 devcontainer엔 rclone이 없어 실패 경로만 돌았고, `RCLONE_VERSION`이 설정된 상태에서 rclone을 실행하는 경로를 한 번도 안 탔다.

### 재검증 절차 (2차 배포 후, 워크스페이스 에이전트용)

전제: 2차 수정이 배포되고 워크스페이스를 **update + restart** 했다. 순서대로 하고, 한 단계라도 실패하면 멈추고 결과를 이 문서에 적는다.

**1. 새 템플릿이 적용됐는지**

```bash
grep -c 'install <버전>' /usr/local/bin/rclone-mounts   # 1 이상
env | grep '^RCLONE_' || echo "RCLONE_ env 없음"         # 출력: RCLONE_ env 없음
for p in $(pgrep -f 'sync --auto'); do tr '\0' '\n' </proc/$p/environ | grep '^RCLONE_'; done   # 출력 없음
```

0이면 옛 헬퍼다. 워크스페이스 update(템플릿 버전)부터 다시 확인.

**2. 기동 시 설치·마운트**

```bash
head -n 20 ~/.cache/rclone-mounts/sync.log
rclone version | head -n 1
rclone-mounts status -v
```

통과 기준:
- `sync.log`에 `rclone v1.75.2 설치 시작`과 `rclone v1.75.2 설치 완료`가 둘 다 있다. `설치 실패`·`CRITICAL`·`command not found`는 없다
- `rclone v1.75.2`
- `✅ gdrive-secrets ...`
- Coder UI **Rclone Mounts** 스크립트가 성공(exit 0)

**3. 루프 재설치 (2 통과 후에만)**

이미 떠 있는 `rclone mount` 데몬은 메모리에 있어 바이너리를 지워도 마운트는 유지된다.

```bash
sudo apt-get remove -y rclone
command -v rclone || echo "제거됨"
sleep 45
rclone version | head -n 1          # rclone v1.75.2 로 돌아와야 함
tail -n 5 ~/.cache/rclone-mounts/sync.log   # 설치 시작 / 설치 완료
rclone-mounts status -v             # ✅
```

45초 안에 안 돌아오면 30초 더 기다린 뒤 다시 본다. 그래도 없으면 실패로 기록하고 `sudo apt-get install` 수동 복구는 하지 말고 `sync.log` 끝부분을 적는다(루프가 계속 재시도 중일 수 있다).

**결과 기록:** 각 단계 통과/실패와 핵심 출력 한두 줄을 타임라인에 append. 1~3이 모두 통과하면 수용 기준 1·5를 체크한다. 2(설치 실패 시 스크립트 실패 표시)는 로컬 실패 경로 테스트로만 확인했으므로 라이브 증명 없이 체크하지 않는다 — 닫을지는 사용자가 정한다.

### restart 실검증 통과 (2차, 2026-11-02 15:35 KST)

워크스페이스 uptime 1분(15:35 기동). 문서의 1→2→3 순서로 실행.

| 단계 | 결과 |
|------|------|
| 1. 새 템플릿 | **통과.** `grep -c 'install <버전>'` = 3. `RCLONE_ env 없음`. 루프 PID environ에 `RCLONE_*` 없음. 살아 있는 coder_script cmdline이 `rclone-mounts install "$rclone_version"` |
| 2. 기동 설치·마운트 | **통과.** `15:35:46 설치 시작` / `15:35:57 설치 완료`. `rclone v1.75.2`. `✅ gdrive-secrets`. mountinfo `fuse.rclone allow_other`. 데몬 `/usr/bin/rclone mount gdrive:secrets ...`. `설치 실패`·`CRITICAL`·`command not found` 없음 |
| 3. 루프 재설치 | **통과.** 15:37:24 `apt-get remove` → `command -v` 없음. 데몬 PID 2957은 메모리에 남아 있음. 15:37:29 루프가 `설치 시작`, 15:37:36 `설치 완료`. 45초 후 `rclone v1.75.2`, `status -v` ✅, 마운트 유지 |

제거 직후 `status -v`는 `❌ rclone 미설치`였다(`command -v rclone` 기준). 마운트 자체는 안 끊겼고, 바이너리가 돌아오자 ✅.

Coder 대시보드 **Rclone Mounts** 스크립트 exit 코드는 이 셸에서 안 봄. 설치가 성공하고 마운트가 붙은 것으로 추정만 가능.

보충(담당 에이전트, 15:42): Kata Pod `/tmp/coder-agent.log`에서 Rclone Mounts 스크립트(`coder-script-080e1eff-….log`, 로그에 `설치 시작`/`설치 완료`/`마운트: gdrive-secrets`) `script completed … execution_time=18.2s exit_code=0` 확인. 성공 경로 exit 코드는 실측. 실패 경로(`exit 1`)는 여전히 로컬 테스트만.

### 이 워크스페이스 임시 복구 (15:15, 이후 불필요)

당시 `RCLONE_VERSION`이 없는 셸에서 `rclone-mounts sync` → ✅. 15:35 restart 이후에는 템플릿이 직접 마운트하므로 이 우회는 더 이상 필요 없다.

## 수용 기준 (검증 메모, 2026-11-02 15:15)

담당 에이전트 메모: 설치 실패 시 Coder 스크립트 실패 표시·네트워크 흔들림 복구는 라이브에서 아직 증명 못 함. 라이브에서 본 것:

- [ ] stop → start 후 `rclone version` = `rclone v1.75.2` **이고** `rclone-mounts status -v` ✅ — 버전 문자열은 셸에서 맞음. 마운트는 ❌ (RCLONE_VERSION 충돌)
- [ ] 설치 실패 시 Coder 스크립트 **Rclone Mounts**가 실패로 보임 — 이번 restart는 apt 성공 후 env 충돌로 install이 실패 처리됨. 대시보드 실패 표시는 여기선 따로 안 봄
- [x] `main`·`test` 템플릿 동일 수정 (코드상)
- [x] Home `~/.config/rclone/` 계약 유지 (토큰 없음)
- [x] 설치 로그가 `sync.log`에 남음 (`설치 시작`은 남음. `설치 완료`는 안 남음)

## 루트 원인

### 1. rclone은 이미지에 없고, 설치 실패를 무시한다

`scripts.tf` `coder_script.rclone-mounts` (`main`/`test` 동일):

```bash
#!/bin/bash
RCLONE_VERSION=${local.rclone_version}   # locals.tf = "1.75.2"
sudo apt-get install -y -o DPkg::Lock::Timeout=300 -o Dpkg::Options::=--force-confold fuse3
if [ "$(rclone version 2>/dev/null | head -n 1)" != "rclone v$RCLONE_VERSION" ]; then
  deb=$(mktemp --suffix=.deb)
  curl -fsSL -o "$deb" "https://downloads.rclone.org/v$RCLONE_VERSION/rclone-v$RCLONE_VERSION-linux-amd64.deb"
  sudo apt-get install -y -o DPkg::Lock::Timeout=300 "$deb"
  rm -f "$deb"
fi
# … fuse.conf, rclone-mounts 헬퍼 설치 …
: >"$HOME/.cache/rclone-mounts/sync.log"
rclone-mounts sync
( while true; do sleep 30; rclone-mounts sync --auto; done ) >>... &
disown
```

문제:

- 스크립트에 `set -e`가 없다. `curl -f` 실패·`apt-get` 실패 후에도 **그대로 진행**한다.
- 설치 후 `rclone version`을 다시 확인하지 않는다.
- 설치 stdout/stderr는 Coder **Rclone Mounts** 스크립트 로그로만 가고, `sync.log`는 그 다음 `: >`로 비운다. 워크스페이스 사용자는 설치 실패 이유를 헬퍼 로그만 보고 찾기 어렵다.
- 13:21 시점에 `https://downloads.rclone.org/v1.75.2/rclone-v1.75.2-linux-amd64.deb`는 HTTP 200·32.3MB로 살아 있었다. **영구적인 URL 장애는 아니다.** 기동 직후 한 번의 curl/apt가 실패한 것으로 보는 게 맞다.

이번 기동에서 fuse3 apt는 성공(패키지 존재)했고 rclone apt/curl만 빠졌다. 후보:

1. **기동 직후 외부 HTTPS 미준비** — `curl -fsSL` 한 번 실패하면 끝.
2. **apt/dpkg 락** — 같은 start에 `install-devcontainers-cli`(curl 없을 때만 apt), `run-dockerd`(e2fsprogs), `main.tf` postStart의 `apt-get update`가 같이 돈다. 2026-10-31에 이미 rclone vs devcontainers-cli 락을 겪었다. `DPkg::Lock::Timeout=300`이 있어도 타임아웃·다른 apt 오류면 설치는 안 되고 스크립트는 계속된다.
3. curl이 빈/깨진 .deb를 남기고 apt가 실패한 뒤 `rm -f "$deb"`로 증거가 사라짐. 관측 시 `/tmp/*.deb` 없음과 일치.

어느 쪽인지는 Coder UI의 **Rclone Mounts** 스크립트 로그를 보면 확정할 수 있다. 워크스페이스 셸에는 그 출력이 없다.

### 2. 재시도 루프는 바이너리를 복구하지 않는다

`rclone-mounts.sh`의 `--auto`는 **이미 같은 줄로 실패한 마운트를 300초 동안 건너뛴다.** rclone이 나중에 깔려도, 설치 루프가 다시 깔지 않는 한 헬퍼는 같은 `command not found`를 5분마다 한 번씩만 시도한다.

설계 의도는 “remote 일시 오류 백오프”이지 “패키지 미설치”가 아니다. 설치가 한 번 빠지면 워크스페이스가 떠 있는 동안 **영구적으로 ❌**다.

### 3. 루트 FS는 휘발, Home만 유지

rclone은 `/usr/bin/rclone`에 깔린다. Kata 워크스페이스 재시작마다 루트는 이미지로 돌아가므로 **매 start마다 재설치가 필수**다. 10:09 기동은 성공, 13:13 기동은 실패 — 설정 drift가 아니라 **start-time 설치의 비결정성**이다.

## 이번 기동에서 한 임시 조치 (템플릿 밖)

워크스페이스에서 템플릿과 같은 방법으로 복구했다. 다른 워크스페이스/다음 재시작에는 다시 재발할 수 있다.

```bash
RCLONE_VERSION=1.75.2
deb=$(mktemp --suffix=.deb)
curl -fL --retry 3 --retry-delay 2 -o "$deb" \
  "https://downloads.rclone.org/v$RCLONE_VERSION/rclone-v$RCLONE_VERSION-linux-amd64.deb"
sudo apt-get install -y -o DPkg::Lock::Timeout=300 "$deb"
rm -f "$deb"
rclone-mounts sync
rclone-mounts status -v
# → ✅ gdrive-secrets  /home/coder/mnt/gdrive-secrets ← gdrive:secrets
```

확인: `rclone v1.75.2`, mountinfo `fuse.rclone` `allow_other`, 프로세스 `/usr/bin/rclone mount gdrive:secrets ... --daemon`.

## 수정 방향 (담당 에이전트에게)

`main`과 `test`를 같이 고친다. 자격 증명을 템플릿에 넣지 않는 현재 모델은 유지.

### 해야 할 것

1. **설치를 실패로 취급한다.** `set -euo pipefail` 또는 curl/apt 각각 `|| exit`. 설치 직후 `rclone version`이 `rclone v$RCLONE_VERSION`인지 assert. 실패 시 Coder 스크립트를 non-zero로 끝내 대시보드에 실패가 보이게.
2. **다운로드 재시도 + fallback.** `curl --retry` + GitHub release  
   `https://github.com/rclone/rclone/releases/download/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-amd64.deb`  
   (2026-11-02에 302로 유효). `.deb` 크기/존재 확인 후에만 apt.
3. **rclone이 없을 때 `rclone-mounts sync`를 호출하지 않는다.** 헬퍼만 깔고 sync하면 지금처럼 `command not found`가 마운트 로그에 쌓이고 `.failed` 백오프만 건다.
4. **루프가 설치를 다시 시도하게 하거나, `--auto`에서 “바이너리 없음”은 백오프하지 않는다.** 최소: 루프 앞에서 `command -v rclone`이 없으면 설치 블록을 재실행.
5. **apt를 직렬화한다.** 2026-10-31과 같은 락 경쟁. start 스크립트들의 apt를 한 flock으로 묶거나, fuse3/rclone을 이미지에 넣고 start apt를 없애는 편이 더 낫다.
6. **가능하면 이미지에 rclone 1.75.2 + fuse3를 굽는다.** start마다 32MB 외부 다운로드에 의존하지 않게. `locals.tf`의 `rclone_version`과 이미지 핀을 맞출 것.
7. **로그:** `sync.log`를 설치 전에 truncate하지 말거나, 설치 실패를 `sync.log`/헬퍼 로그에 남긴다. metadata는 `command not found`를 `'준비 중'`으로 숨기지 말 것.

### 하지 말 것

- Google Drive 재인증, `rclone.conf` 템플릿 파라미터화, mounts 목록을 IaC에 넣는 것 — 이번 장애와 무관하고 기존 설계(자격 증명은 Home)를 깨뜨린다.
- Ubuntu universe `rclone` 1.60.x로 대체 — 템플릿이 1.75.2를 고정한다. 버전 문자열이 안 맞으면 매 기동마다 공식 .deb를 다시 받는다.
- 라이브 워크스페이스의 수동 설치를 “수정 완료”로 닫지 말 것. 다음 stop/start에서 재발한다.

## 수용 기준

15:35 restart 실측. **닫을지는 사용자.** 설치 실패 시 대시보드 실패 표시는 라이브에서 안 봄.

- [x] 워크스페이스 stop → start 후 `rclone version`이 `rclone v1.75.2`이고 `rclone-mounts status -v`가 ✅ — 15:35 기동에서 확인. 네트워크 흔들림(curl 92) 재현은 이번 restart에 없음
- [ ] rclone 설치가 실패하면 Coder 스크립트 **Rclone Mounts**가 실패로 보이고, `sync --auto`만 조용히 돌지 않는다 — 로컬 실패 경로만. 라이브 미증명
- [x] `main`·`test` 템플릿 동일 수정
- [x] 기존 Home `~/.config/rclone/` 계약 유지 (템플릿에 토큰 없음)
- [x] 설치 결과가 `sync.log`에 남음 (`설치 시작`/`설치 완료`, truncate 후 기동 로그가 보임)
- [x] `RCLONE_*` 환경변수를 rclone 프로세스에 넘기지 않는다 — 15:35 루프 environ 실측, 인자 `install 1.75.2`

## 범위 밖

- pCloud Lane A 백업용 rclone (클러스터 Job 이미지)
- Sysbox 템플릿 (`sysbox-ubuntu`, 2026-11-06 제거 예정)
- 이번 워크스페이스에 수동 설치한 rclone을 회수하는 것

## 관련 경로

| 파일 | 역할 |
|------|------|
| `infra/k8s-workstation-tools/assets/coder/kata-ubuntu/main/scripts.tf` | 기동 시 fuse3 + rclone .deb 설치, 헬퍼 배치, sync 루프 |
| `infra/k8s-workstation-tools/assets/coder/kata-ubuntu/test/scripts.tf` | 위와 동일 |
| `infra/k8s-workstation-tools/assets/coder/kata-ubuntu/{main,test}/locals.tf` | `rclone_version = "1.75.2"` |
| `infra/k8s-workstation-tools/assets/coder/kata-ubuntu/{main,test}/assets/files/rclone-mounts.sh` | 마운트 헬퍼. `--auto` 300s 백오프 |
| `infra/k8s-workstation-tools/assets/coder/kata-ubuntu/{main,test}/agent.tf` | 대시보드 `rclone-mounts status` |
| `.devcontainer/commands/initializeCommand.sh` | `/mnt/rclone` 마운트 대기. 호스트 마운트가 없으면 여기서 실패 |

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-31 | Kata 템플릿에 rclone 마운트 도입. 같은 날 apt 락(devcontainers-cli)과 rclone 데몬 파이프 수정 |
| 2026-11-02 13:18 KST | production Kata 워크스페이스 재기동 후 rclone 바이너리 없음으로 `gdrive-secrets` ❌ |
| 2026-11-02 13:21 KST | 워크스페이스에서 공식 .deb 수동 설치 + `rclone-mounts sync`로 복구. 템플릿은 그대로 |
| 2026-11-02 | 이 이슈 등록. 담당 에이전트 인수인계 |
| 2026-11-02 14:00 KST | Kata Pod Coder 스크립트 로그로 원인 확정: curl exit 92(HTTP/2 INTERNAL_ERROR)로 잘린 .deb → apt 실패. apt 락 아님 |
| 2026-11-02 14:10 KST | `main`·`test` 템플릿 수정(설치 재시도·검증·실패 표시·루프 재설치). 당시 미배포 |
| 2026-11-02 ~15:07 | 수정분 배포 후 워크스페이스 stop (마운트 SIGTERM 15:07:33, 15:13:01) |
| 2026-11-02 15:13 KST | restart. 새 스크립트 동작 확인(`설치 시작`). apt는 rclone 1.75.2 설치. 직후 `export RCLONE_VERSION` 충돌로 `버전 불일치 ()` + `rclone mount` CRITICAL. `status -v` ❌ |
| 2026-11-02 15:15 KST | 워크스페이스에서 env 없이 수동 `rclone-mounts sync` → ✅. 템플릿 버그는 그대로. 이 이슈에 실검증 결과 기록 |
| 2026-11-02 15:20 KST | 2차 수정: `RCLONE_VERSION` env 제거, `rclone-mounts install <버전>` 인자 방식. 라이브 Pod에서 새 헬퍼 버전 체크 통과 확인. 미배포 |
| 2026-11-02 15:25 KST | 2차 배포 후 워크스페이스 에이전트용 재검증 절차 추가 |
| 2026-11-02 ~15:35 | 2차 배포 후 워크스페이스 restart (직전 마운트 SIGTERM 15:35:13) |
| 2026-11-02 15:35 KST | 재검증 1·2 통과. `설치 시작` 15:35:46 / `설치 완료` 15:35:57. `rclone v1.75.2`. `status -v` ✅. 루프 env에 `RCLONE_*` 없음 |
| 2026-11-02 15:37 KST | 재검증 3 통과. `apt-get remove rclone` 15:37:24 → 루프가 15:37:29 재설치 시작, 15:37:36 완료. 마운트 데몬은 제거 중에도 유지 |
| 2026-11-02 15:42 KST | Coder agent 로그로 Rclone Mounts 스크립트 `exit_code=0`(18.2s) 확인. 상태 **적용** |
| 2026-11-02 | 해결. `docs/issues/resolved`로 이동 |
