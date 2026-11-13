# Kata 워크스페이스 nested Docker에서 memory limit 컨테이너 생성 실패 (cgroup v2 threaded)

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-11-13 |
| **영역** | Coder `kata-ubuntu` 워크스페이스 (`main`·`test`) · 게스트 안 dockerd · DevContainer |
| **관련 코드** | `infra/k8s-workstation-tools/assets/coder/kata-ubuntu/{test,main}/main.tf` (`dev` 컨테이너 `command`), 같은 디렉터리 `scripts.tf` (`run-dockerd`), `README.md` |
| **상태** | **해결** |
| **해결일** | 2026-11-13 |

## 해결 요약

`dev` 컨테이너 시작 명령 맨 앞에서 cgroup v2 nesting(프로세스를 `/init`으로 이동·controller 위임). `test`→검증→`main` 배포. Primary-Kata·원래 DevContainer memory limits 확인 완료.

## 배경

Coder 런타임은 Kata ([sysbox 교체](../resolved/2026-10-24-sysbox-runtime-replacement.md)). 워크스페이스 파드의 `dev` 컨테이너(privileged, Kata 게스트 안)에서 `coder_script` `run-dockerd`가 `sudo dockerd`를 직접 띄우고, 그 위에 DevContainer를 올린다. systemd는 없다.

다른 프로젝트의 DevContainer가 Compose `deploy.resources.limits`(cpu·memory)를 쓰는데, 이 워크스페이스에서만 기동이 실패한다는 보고가 들어왔다 (원문: `tmp/advisor/kata-cgroup-devcontainer-resource-limits.md`, gitignore 경로라 핵심만 여기에 옮긴다).

## 증상

memory limit이 있는 컨테이너를 만들면 생성 단계에서 실패한다. limit을 빼면 뜬다.

```text
OCI runtime create failed: runc create failed: unable to start container process:
unable to apply cgroup configuration:
cannot enter cgroupv2 "/sys/fs/cgroup/docker" with domain controllers -- it is in threaded mode
```

## 재현

워크스페이스(`dev` 컨테이너) 셸에서:

```bash
docker run --rm --memory 256m alpine true      # 실패 (위 오류)
docker run --rm --cpus 0.5 alpine true         # 성공 (cpu는 threaded controller)
docker run --rm alpine true                    # 성공
```

Compose로는 서비스에 아래를 넣고 `docker compose up`.

```yaml
deploy:
  resources:
    limits:
      cpus: "3.00"
      memory: 6GB
```

## 실측 (2026-11-13, `coder-kata-ubuntu` `Primary-Kata` 파드 `dev` 컨테이너, 읽기 전용 확인)

| 항목 | 값 |
|------|-----|
| `/proc/1/cgroup` | `0::/` (PID 1 = `./coder agent`) |
| `/sys/fs/cgroup/cgroup.type` | `domain threaded` (파일이 있다 = cgroup namespace 루트이지 진짜 루트가 아니다) |
| `/sys/fs/cgroup/cgroup.procs` | 91개 프로세스가 루트에 직접 있음 |
| `cgroup.controllers` | `cpuset cpu io memory hugetlb pids rdma` |
| `cgroup.subtree_control` | `cpuset cpu pids` (memory·io·hugetlb·rdma 없음) |
| `/sys/fs/cgroup/docker/cgroup.type` | `threaded` |
| 마운트 | `cgroup2 rw,nsdelegate,memory_recursiveprot` |
| Docker | 29.9.3, Cgroup Driver `cgroupfs`, Cgroup Version 2, runc 1.5.2 |
| 게스트 커널 | 6.18.35 |

## 원인

cgroup v2의 "no internal process" 제약 때문이다. 프로세스가 직접 들어 있는 (루트가 아닌) cgroup은 domain controller(memory·io 등)를 하위로 위임할 수 없다. threaded controller(cpu·cpuset·pids)만 예외다.

1. `dev` 컨테이너는 cgroup namespace 안이라 `/sys/fs/cgroup`이 루트처럼 보이지만 실제로는 일반 cgroup이다. 컨테이너의 모든 프로세스(agent, dockerd 등)가 그 cgroup에 직접 들어 있다.
2. dockerd(cgroupfs 드라이버)·runc가 `/sys/fs/cgroup/docker/<id>`를 만들며 루트 `cgroup.subtree_control`에 controller를 켠다. 프로세스가 있으므로 threaded controller만 켜지고(memory·io는 EBUSY), 이때 루트가 `domain threaded`로 바뀐다.
3. threaded domain 아래 새 cgroup은 `domain invalid`로 만들어진다. runc는 domain controller가 필요 없으면 이를 `threaded`로 바꿔서 진행하고, memory 같은 domain controller 리소스가 있으면 위 오류로 실패한다 (runc `libcontainer/cgroups/fs2/create.go`의 오류 문구와 일치).

즉 앱 쪽 Compose 문법 문제가 아니고, Kata·게스트 커널 설정 문제도 아니다. **워크스페이스 컨테이너가 dockerd를 띄우기 전에 cgroup nesting을 하지 않는 것**이 원인이다. 호스트 Kata 설정(Ansible)·RuntimeClass(Pulumi)는 바꿀 것이 없다.

| 가설 | 판정 |
|------|------|
| 앱 Dockerfile·Compose 문법 | 배제 — `docker run --memory` 단독으로 재현되는 구조 |
| 게스트 커널에 memory controller 없음 | 배제 — `cgroup.controllers`에 memory·io 있음 |
| Kata agent가 controller를 위임하지 않음 | 배제 — 컨테이너 cgroup에 controller는 내려와 있다. 컨테이너 내부에서 하위로 못 넘기는 것 |
| volume `already exists for another project`·`BASE_IMAGE` 경고 | 배제 — 이번 실패와 무관 (보고서 비고) |

## 접근 비교

| 안 | 내용 | 판단 |
|------|------|------|
| A. 컨테이너 시작 명령에서 cgroup nesting | dockerd·agent가 뜨기 전에 루트의 프로세스를 `/sys/fs/cgroup/init`으로 옮기고 전체 controller를 `cgroup.subtree_control`에 켠다 (moby `hack/dind`, DevContainer `docker-in-docker` feature와 같은 방식) | **추천**. 템플릿 한 곳 수정, 이후 프로세스는 `/init`을 상속 |
| B. `run-dockerd`(`coder_script`)에서 nesting | dockerd 직전에 수행 | 비추천. 그 시점엔 agent·다른 `coder_script`가 루트에서 계속 fork 중이라 EBUSY 경쟁이 크다. PID 1(agent)도 옮겨야 한다 |
| C. 워크스페이스에 systemd 도입 + dockerd systemd cgroup 드라이버 | systemd가 위임을 관리 | 범위 과다. 템플릿은 systemd 없이 동작하도록 확정돼 있다 (sysbox 교체 이슈) |
| D. 앱 쪽에서 limits 제거 | 현행 우회 | 임시 우회. 근본 해결 아님 |

## 추천

A. `dev` 컨테이너 `command`의 **맨 앞**(home 마운트보다 먼저, `coder_agent.main.init_script`보다 먼저)에서 nesting을 수행한다. 그 시점엔 프로세스가 PID 1 `sh`와 자식 몇 개뿐이라 경쟁이 거의 없고, 이후 모든 프로세스(agent, dockerd, `coder_script`)가 `/init`을 상속한다. 실패해도 기동은 계속한다(fail-open: 최악의 경우 현재와 같은 상태).

## 해결 계획

작업자(Cursor)용. 순서를 지킨다. `test` 템플릿에 먼저 넣어 검증하고, 통과하면 `main`에 같은 변경을 넣는다. `main`과 `test`는 `README.md` 두 줄(네임스페이스·원본 템플릿 이름) 말고는 동일해야 한다.

### 전제·주의

- 스킬 `coder-templates`(`.rulesync/skills/coder-templates/SKILL.md`)를 읽고 따른다. `coder templates push`는 쓰지 않는다. 배포는 Pulumi(`infra/k8s-workstation-tools`, `coderd.Template`)가 한다.
- `pulumi up`은 템플릿 새 버전을 active로 올린다(외부 반영). **사용자 확인 후** 실행한다. 워크스페이스 재시작(Update)·생성·삭제는 사용자가 한다.
- 실행 중인 `Primary-Kata`(`coder-kata-ubuntu`)에 직접 손대지 않는다. 이미 `domain threaded`가 된 실행 중 컨테이너는 고칠 수 없다(프로세스 91개가 루트에 있고 dockerd·컨테이너가 떠 있다). 새 템플릿 버전으로 재시작해야 반영된다.
- 커밋·PR은 사용자 요청 시만. 커밋 메시지는 `pnpm script:generateCommitMessage`, PR은 `pnpm script:openPullRequest`.
- Terraform heredoc 안이므로 셸의 `${...}`는 `$${...}`로 써야 한다(`$var`, `$(...)`는 그대로). 아래 코드 블록은 이미 그렇게 쓰여 있다.
- 호스트 Kata 설정(`ansible/workstation/roles/configure-kata-containers/`), RuntimeClass(`infra/k8s-workstation-system/src/components/kata/`)는 수정하지 않는다.

### 파일

| 파일 | 변경 |
|------|------|
| `infra/k8s-workstation-tools/assets/coder/kata-ubuntu/test/main.tf` | `dev` 컨테이너 `command` heredoc 맨 앞에 nesting 블록 추가 (Task 1) |
| `infra/k8s-workstation-tools/assets/coder/kata-ubuntu/test/README.md` | `## 변경 사항`에 항목 추가 (Task 1) |
| `infra/k8s-workstation-tools/assets/coder/kata-ubuntu/main/main.tf` | Task 1과 같은 블록 (Task 3) |
| `infra/k8s-workstation-tools/assets/coder/kata-ubuntu/main/README.md` | Task 1과 같은 항목 (Task 3) |
| 이 문서, `docs/schedule.md` | 타임라인·수용 기준·상태 갱신 (각 Task 끝) |

`scripts.tf`(`run-dockerd`)는 바꾸지 않는다. dockerd는 `/init`을 상속해 뜨고, `/sys/fs/cgroup/docker`는 루트 바로 아래에 domain으로 만들어진다.

### Task 1: `test` 템플릿에 cgroup nesting 추가

- [x] **1-1. nesting 블록 삽입.** `kata-ubuntu/test/main.tf`의 `container { name = "dev" ... command = ["sh", "-c", <<-EOT` heredoc에서 첫 줄 `# home PVC(Block): 첫 기동에 ext4 포맷, ...` **바로 위**에 아래를 넣는다. 들여쓰기는 heredoc의 다른 줄과 같은 깊이(공백 14칸)로 맞춘다.

  ```sh
  # cgroup v2 nesting: 컨테이너 cgroup 루트에 프로세스가 있으면 domain controller(memory·io)를 하위로 못 넘긴다 (no internal process)
  # → dockerd가 memory limit 컨테이너를 못 만든다 ("it is in threaded mode"). agent·dockerd가 뜨기 전에 프로세스를 /init 으로 옮기고
  # 전체 controller를 위임한다 (moby hack/dind 방식). 이후 프로세스는 /init 을 상속한다. 실패해도 기동은 계속한다
  # @see docs/issues/resolved/2026-11-13-kata-nested-docker-cgroup-v2-memory-limit.md
  if [ -f /sys/fs/cgroup/cgroup.controllers ]; then
    sudo sh -c '
      cg=/sys/fs/cgroup
      log=/tmp/cgroup-nesting.log
      : >"$log"
      mkdir -p "$cg/init"
      for try in 1 2 3 4 5; do
        # cgroup.procs 는 write 한 번에 PID 하나. 이미 끝난 PID 오류는 무시한다
        xargs -rn1 <"$cg/cgroup.procs" >"$cg/init/cgroup.procs" 2>/dev/null || :
        missing=""
        for c in $(cat "$cg/cgroup.controllers"); do
          echo "+$c" >"$cg/cgroup.subtree_control" 2>/dev/null || :
          grep -qw "$c" "$cg/cgroup.subtree_control" || missing="$missing $c"
        done
        [ -z "$missing" ] && break
        sleep 0.2
      done
      echo "type=$(cat "$cg/cgroup.type") subtree=$(cat "$cg/cgroup.subtree_control") missing=$${missing:-none}" >>"$log"
    ' || true
  fi
  ```

  결정 사항(바꾸지 말 것):
  - 위치는 heredoc 맨 앞. `sudo mount`나 `init_script` 뒤로 옮기지 않는다.
  - controller는 하나씩 켠다(한 줄에 전부 쓰면 하나만 실패해도 전체가 실패한다). 성공 여부는 `echo` 종료 코드가 아니라 `cgroup.subtree_control`을 다시 읽어 판정한다(`/bin/sh`가 dash).
  - 로그는 `/tmp/cgroup-nesting.log` 한 줄. 표준 출력으로 내지 않는다.
  - `|| true`로 fail-open.

- [x] **1-2. README 변경 사항.** `kata-ubuntu/test/README.md`의 `## 변경 사항` 맨 위에 추가한다. 날짜는 실제 배포일.

  ```markdown
  ### <배포일 YYYY-MM-DD>

  - DevContainer·Docker 컨테이너에 메모리 제한(`--memory`, Compose `deploy.resources.limits`)을 걸 수 있습니다. 이전에는 컨테이너 생성이 `it is in threaded mode` 오류로 실패했습니다. 반영하려면 워크스페이스를 Update(재시작)하세요.
  ```

- [x] **1-3. 정적 검증.**

  ```bash
  terraform fmt -check -diff infra/k8s-workstation-tools/assets/coder/kata-ubuntu/test
  pnpm --filter @infra/k8s-workstation-tools test
  ```

  기대: `fmt` 출력 없음(종료 코드 0), jest 전부 통과. `terraform validate`는 provider 초기화가 필요하므로 선택(`terraform -chdir=<dir> init -backend=false && terraform -chdir=<dir> validate`, 끝나면 생성된 `.terraform*`을 지운다).

- [x] **1-4. preview.** `pnpm --filter @infra/k8s-workstation-tools pulumi:preview`. 기대: `kataUbuntuTestTemplate` 1개만 update(버전 디렉터리 해시 변경). `kataUbuntuTemplate`(main) 및 다른 리소스는 변경 없음. 다른 변경이 보이면 멈추고 사용자에게 보고한다.

- [x] **1-5. 배포(사용자 확인 후).** `pnpm --filter @infra/k8s-workstation-tools pulumi:up`.

### Task 2: `test` 워크스페이스에서 검증 (게이트)

사용자에게 **Ubuntu on Kata (Test)**(`kata-ubuntu-test-template`, 네임스페이스 `coder-kata-ubuntu-test`) 워크스페이스 생성 또는 Update를 요청한다. 아래는 그 워크스페이스 셸에서 실행한다. 결과(명령·출력 한 줄씩)를 이 문서 `## 검증` 표에 적는다.

- [x] **2-1. nesting 상태.**

  ```bash
  cat /tmp/cgroup-nesting.log          # type=domain subtree=cpuset cpu io memory hugetlb pids rdma missing=none
  cat /proc/1/cgroup                   # 0::/init
  cat /proc/$(pgrep -x dockerd)/cgroup # 0::/init
  cat /sys/fs/cgroup/cgroup.procs | wc -l   # 0 (2-6의 exec 중에는 예외일 수 있음)
  ```

- [x] **2-2. memory·cpu limit 컨테이너.**

  ```bash
  docker run --rm --memory 256m --cpus 0.5 alpine sh -c 'cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/cpu.max'
  # 268435456
  # 50000 100000
  cat /sys/fs/cgroup/docker/cgroup.type   # domain
  ```

- [x] **2-3. 제한이 실제로 걸리는지.**

  ```bash
  docker run --rm --memory 64m alpine sh -c 'tail /dev/zero'; echo "exit=$?"   # exit=137
  ```

  워크스페이스 접속·agent·dockerd가 그대로 살아 있어야 한다(`docker info` 성공).

- [x] **2-4. Compose `deploy.resources.limits`.** 임시 디렉터리에 아래 `compose.yml`을 만들고 `docker compose up -d && docker inspect -f '{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}}' $(docker compose ps -q app) && docker compose down`. 기대: `6000000000 3000000000`.

  ```yaml
  services:
    app:
      image: alpine
      command: sleep 300
      deploy:
        resources:
          limits:
            cpus: "3.00"
            memory: 6GB
  ```

- [x] **2-5. DevContainer + `docker-in-docker` feature.** 임시 폴더에 `.devcontainer/devcontainer.json`(`"image": "mcr.microsoft.com/devcontainers/base:ubuntu"`, `"features": {"ghcr.io/devcontainers/features/docker-in-docker:2": {}}`, `"runArgs": ["--memory=2g"]`)을 두고 `devcontainer up --workspace-folder .` → `devcontainer exec --workspace-folder . docker run --rm --memory 128m alpine true`. 기대: 둘 다 성공. 끝나면 컨테이너를 지운다.

- [x] **2-6. `kubectl exec` 회귀 확인 (게이트).** 루트 cgroup에 domain controller가 켜지면 그 cgroup에 프로세스를 새로 넣는 것이 EBUSY로 막힌다. Kata agent가 exec 프로세스를 컨테이너 cgroup 루트에 넣는 방식이면 `kubectl exec`가 깨질 수 있다(가설, 미확인. runc는 이 경우 init 프로세스의 cgroup으로 폴백한다). kubernetes MCP `pods_exec`(또는 `kubectl exec -n coder-kata-ubuntu-test <pod> -c dev -- cat /proc/self/cgroup`)로 확인한다.

  | 결과 | 조치 |
  |------|------|
  | 성공 (`0::/` 또는 `0::/init`) | 통과. 출력을 기록 |
  | 실패 (EBUSY 등) | **멈춘다. Task 3으로 가지 않는다.** 오류 원문을 이 문서에 적고 사용자에게 판단을 요청한다(Coder SSH·웹 터미널은 agent 경유라 영향 없음. `kubectl exec` 디버깅 포기 여부는 사용자 결정) |

- [x] **2-7. 대시보드 메트릭 회귀 확인.** agent가 `/init`으로 옮겨지므로 `coder stat`(Coder 2.39.1)이 자기 cgroup 경로 기준으로 읽으면 한도가 사라지거나 Docker 컨테이너 사용량이 빠질 수 있다(가설, 미확인).

  ```bash
  coder stat mem    # 총량이 워크스페이스 Memory 파라미터 값(GB)과 같아야 한다
  coder stat cpu    # 총량이 CPU 파라미터 값과 같아야 한다
  cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/cpu.max   # 비교 기준 (컨테이너 전체 한도)
  ```

  총량이 VM 전체 값이나 무제한으로 나오면 `agent.tf`의 `0_cpu_usage`·`1_ram_usage` 메타데이터 수정이 필요하다. 이 경우 멈추고 이 문서에 출력과 함께 기록한 뒤 사용자에게 보고한다(대체안: `/sys/fs/cgroup/memory.current`·`memory.max`를 직접 읽는 스크립트. 이 이슈 범위에 넣을지는 사용자 결정).

- [x] **2-8. 기존 기능 회귀 확인.** 워크스페이스 Start가 스크립트 오류 없이 끝남, `docker ps` 동작, `rclone-mounts status -v` 정상, DevContainer 안에서 클러스터 서비스 호출(`curl -s -o /dev/null -w '%{http_code}' https://coder.ayteneve93.com` → 200), 홈·data 마운트(`mountpoint /home/coder /home/coder/data`).

- [x] **2-9. 문서 갱신.** 이 문서 타임라인에 한 줄 append, `## 검증` 표 작성, 통과한 수용 기준 체크.

### Task 3: `main` 템플릿 반영

Task 2가 전부 통과(2-6·2-7 게이트 포함)했을 때만 진행한다.

- [x] **3-1.** Task 1-1 블록을 `kata-ubuntu/main/main.tf` 같은 위치에, 1-2 항목을 `kata-ubuntu/main/README.md`에 넣는다.
- [x] **3-2. 동일성 확인.**

  ```bash
  diff -rq infra/k8s-workstation-tools/assets/coder/kata-ubuntu/main infra/k8s-workstation-tools/assets/coder/kata-ubuntu/test
  # Files .../main/README.md and .../test/README.md differ  ← 이 한 줄만
  terraform fmt -check -diff infra/k8s-workstation-tools/assets/coder/kata-ubuntu/main
  ```

- [x] **3-3.** `pulumi:preview` → `kataUbuntuTemplate` 1개만 update 확인 → 사용자 확인 후 `pulumi:up`.
- [x] **3-4.** 사용자에게 `Primary-Kata` Update(재시작)를 요청한다. 재시작 뒤 2-1·2-2를 `Primary-Kata`에서 다시 확인하고, 보고서의 원래 프로젝트 DevContainer(`deploy.resources.limits` cpus `3.00`·memory `6GB`)가 뜨는지 사용자 확인을 받는다.
- [x] **3-5.** 이 문서 타임라인·수용 기준 갱신, 상태를 **적용**으로. `docs/schedule.md` 행을 같은 턴에 맞춘다. 아카이브(`resolved` 이동)는 사용자가 닫으라고 할 때만.

### 검증에서 특히 볼 것

계획의 단계가 직접 다루지 않아 놓치기 쉬운 조건이다.

| 조건 | 기대 동작 |
|------|-----------|
| nesting 실패(예: 경쟁으로 EBUSY 5회) | 워크스페이스는 평소처럼 뜬다. `/tmp/cgroup-nesting.log`에 `missing=` 값이 남는다. memory limit만 여전히 실패 |
| kubelet이 `dev` 컨테이너만 재시작 | `mkdir -p`·이동·위임이 다시 돌아도 오류 없이 같은 결과 |
| dockerd가 죽고 재기동 루프가 다시 띄움 | 새 dockerd도 `/init` 상속. `/sys/fs/cgroup/docker`는 계속 domain |
| limit 초과 컨테이너 OOM | 그 컨테이너만 kill(137). agent·dockerd·다른 컨테이너 영향 없음 |
| limit 없는 기존 컨테이너·Compose 프로젝트 | 이전과 똑같이 동작 |

## 수용 기준

- [x] 새로 뜬 워크스페이스에서 `/sys/fs/cgroup/cgroup.type`이 `domain`, `cgroup.subtree_control`에 `memory`·`io` 포함, PID 1·dockerd가 `0::/init` (실측: `/init` 소속 확인. `/proc/*/cgroup` 표시는 `0::/` — 비고는 `## 검증`)
- [x] `docker run --memory 256m --cpus 0.5`가 성공하고 컨테이너 안 `memory.max`·`cpu.max`가 지정값
- [x] Compose `deploy.resources.limits`(cpus·memory) 서비스가 뜨고 `HostConfig`에 반영
- [x] DevContainer `docker-in-docker` feature 컨테이너가 뜨고 그 안에서도 memory limit 컨테이너 생성 가능 (`moby: false` 필요 — feature/OS 이슈, cgroup 무관)
- [x] `kubectl exec`·Coder 대시보드 CPU/RAM 메트릭·rclone 마운트·DevContainer 메시 호출 회귀 없음 (있으면 사용자 결정 기록)
- [x] `main`·`test` 템플릿이 `README.md` 외 동일. `Primary-Kata` nesting·`--memory` OK. 원래 프로젝트 DevContainer limits 기동 사용자 확인 완료

## 범위 밖

- 워크스페이스에 systemd 도입, dockerd systemd cgroup 드라이버 전환
- 워크스페이스 템플릿이 DevContainer 리소스 상한을 강제하는 기능(파라미터화 등). 필요하면 후속 이슈로 분리
- 게스트 메모리·페이지 캐시 튜닝 ([qemu memcg OOM](../resolved/2026-11-11-kata-workspace-qemu-memcg-oom.md) 범위 밖 항목과 동일)

## 관련 링크

- cgroup v2 no internal process·threaded 모드: <https://docs.kernel.org/admin-guide/cgroup-v2.html>
- moby `hack/dind` cgroup v2 nesting: <https://github.com/moby/moby/blob/master/hack/dind>
- runc 오류 출처: `libcontainer/cgroups/fs2/create.go` (<https://github.com/opencontainers/runc>)

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-11-13 | 등록. `Primary-Kata` 파드에서 cgroup 상태 실측(루트 `domain threaded`, 루트에 프로세스 91개, `docker` `threaded`, subtree에 memory·io 없음)으로 원인 확정. 해결 계획(A안: 컨테이너 시작 명령에서 nesting) 작성. 구현은 Cursor 예정 |
| 2026-11-13 | Task 1(1-1~1-4): `kata-ubuntu/test` nesting·README. fmt·jest OK. preview: `coderResources-kataUbuntuTestTemplate`만 update |
| 2026-11-13 | Task 1-5: `pulumi up` 완료. `coderResources-kataUbuntuTestTemplate` active. update #285 |
| 2026-11-13 | Task 2: 워크스페이스 `test`에서 검증 전부 통과(2-6·2-7 게이트 포함). memory/Compose/DevContainer(dind)·OOM·메트릭·exec·curl OK. Task 3(`main`) 대기 |
| 2026-11-13 | Task 3-1~3-3: `main` nesting·README 반영. diff README만. `pulumi up` update #286 (`coderResources-kataUbuntuTemplate`). Primary-Kata Update 대기 |
| 2026-11-13 | Task 3-4: `Primary-Kata` Update 후 확인 — nesting `missing=none`, pid1 in `/init`, `docker run --memory 256m` → 268435456/50000 100000, docker cgroup `domain`. test 워크스페이스는 사용자 삭제 |
| 2026-11-13 | 원래 DevContainer limits 기동 확인. 이슈 해결·`resolved` 아카이브 |
