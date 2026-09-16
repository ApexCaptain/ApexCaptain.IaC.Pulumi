# PVC pCloud 암호화 백업 (Lane A/B)

| 항목          | 내용                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **등록일**    | 2026-09-15                                                                                                                                |
| **영역**      | workstation 클러스터 PVC 오프사이트 백업. `k8s-workstation-system` / `apps` / `tools`, Pulumi ESC                                         |
| **관련 코드** | `common/nexus/src/esc/` (pCloud 예정), `scripts/sync-pulumi-esc.script.ts`, `infra/k8s-workstation-system` (Credentials·Platform), apps/tools (워크로드별 Backup Job) |
| **상태**      | **진행중** — qBit Phase 1 Cron 운영 중 (`config`, 01:00 KST, `keepWithin=2d`, `runOnceOnCreate=false`). ~3일 후 retention·스케줄 확인 |

## 배경

클러스터 Bound PVC(2026-09-15 기준 19개, 전부 RWO)를 외부 스토리지로 안전하게 백업할 필요가 있다. 오프사이트 백엔드는 **pCloud 단일**로 둔다. R2·OCI Always Free(~10 Gi / ~20 Gi)는 1차 범위 밖이며, Lane A 이중화는 후속 선택이다.

할당 용량 대략: HDD계 ~3.1 Ti, SSD계 ~533 Gi, Vault local-path 10 Gi. 몸통은 Jellyfin media 2 Ti · qBittorrent complete 1 Ti. Vault·Postgres 할당 합은 ~36 Gi대.

## 문제

1. PVC 종류가 다르다. Vault Raft·Postgres는 파일 통째 복사가 복구본이 아니다. 미디어는 파일 sync가 맞다.
2. 전부 RWO라 백업 Job이 라이브 PVC를 동시에 마운트하면 Multi-Attach가 난다.
3. 대용량 sync와 소형 DR을 같은 큐에 넣으면 Vault/DB 백업이 굶는다.
4. 백업 자격증명이 Vault에 있으면 Vault 장애 시 DR이 막힌다.

## 목표

- **저장소는 pCloud 하나. 파이프라인은 둘 (Lane A / Lane B).**
- 자격증명은 Pulumi ESC → K8s Secret (Vault VSO 비의존).
- rclone Crypt로 zero-knowledge.
- 전역 “모든 PVC에 rclone sync” 모델은 쓰지 않는다.

## 현재 상태

| 항목                             | 내용                                     |
| -------------------------------- | ---------------------------------------- |
| pCloud ESC/Secret                | ESC sync 완료. system: NS / Secret / ConfigMap(`clusterName`) / Lease `dr`·`media` / `longhorn-snap` |
| VolumeSnapshot / CSI snapshotter | 적용됨. NS `snapshot-controller` (Deployment 1/1, v8.6.0). VSC `longhorn-snap` (`driver.longhorn.io`, `type: snap`, Delete) |
| 백업 CronJob/컴포넌트            | qBit `QbittorrentBackupComponent` 코드 준비. Phase 1: `config` only · cron 01:00 KST · `keepWithin=2d`. 미배포 → 배포 후 모니터링 |
| 구성 SSOT                        | 본 이슈 |
| pCloud 용량 전략                 | POC 통과. Lane B는 유료 플랜 후 |

## PVC 분류 (할당 용량)

### Lane A — 정합성 필수 / 소형 (우선)

| Namespace / PVC                         | 용량   | StorageClass        | 뽑는 방법                            | pCloud 경로(안)                     | 비고                    |
| --------------------------------------- | ------ | ------------------- | ------------------------------------ | ----------------------------------- | ----------------------- |
| `vault/data-vault-0`                    | 10 Gi  | local-path          | `vault operator raft snapshot`       | `k8s-backup/dr/vault/`              | data dir 파일 복사 금지 |
| `coder/coder-postgresql-cluster-1`      | 10 Gi  | longhorn-ssd        | `pg_dump` (CNPG)                     | `k8s-backup/dr/coder-pg/`           |                         |
| `authentik/data-authentik-postgresql-0` | 8 Gi   | longhorn-ssd        | `pg_dump`                            | `k8s-backup/dr/authentik-pg/`       |                         |
| `vikunja/vikunja-postgresql-cluster-1`  | 8 Gi   | longhorn-ssd        | `pg_dump`                            | `k8s-backup/dr/vikunja-pg/`         |                         |
| `jellyfin/jellyfin-config`              | 5 Gi   | longhorn-ssd-retain | VolumeSnapshot 클론 후 tar           | `k8s-backup/dr/jellyfin-config/`    |                         |
| `vikunja/vikunja-data`                  | 2 Gi   | longhorn-ssd        | 동일                                 | `k8s-backup/dr/vikunja-data/`       |                         |
| `qbittorrent/qbittorrent-config`        | 200 Mi | longhorn-ssd        | VolumeSnapshot 클론 후 tar           | `k8s-backup/workstation/dr/qbittorrent/qbittorrent-config/{ts}/` | **Phase 1 Cron 1순위** (무료 3 GB) |

### Lane B — 대용량 파일 (느리게, 큐 분리)

| Namespace / PVC                              | 용량     | StorageClass        | 뽑는 방법                                   | pCloud 경로(안)                          | 비고                       |
| -------------------------------------------- | -------- | ------------------- | ------------------------------------------- | ---------------------------------------- | -------------------------- |
| `jellyfin/jellyfin-media`                    | **2 Ti** | longhorn-hdd-retain | CSI 스냅샷→클론 후 rclone           | `k8s-backup/media/jellyfin-media/`       | 최초 sync 매우 김          |
| `qbittorrent/qbittorrent-complete-downloads` | **1 Ti** | longhorn-hdd        | 동일                                | `k8s-backup/media/qbittorrent-complete/` |                            |
| `coder-sysbox-ubuntu/...-home`               | 50 Gi    | longhorn-ssd        | CSI 스냅샷→클론 후 rclone           | `k8s-backup/coder-ws/home/`              | **포함 확정**              |
| `coder-sysbox-ubuntu/...-data`               | 100 Gi   | longhorn-hdd        | —                                   | —                                        | **제외 확정**              |
| `coder-sysbox-ubuntu/...-docker`             | 100 Gi   | longhorn-ssd        | —                                   | —                                        | **제외 확정** (재pull)     |

### Lane C — 제외 확정 (2026-09-15)

아래 PVC는 백업하지 않는다. 이후 넣으려면 이 이슈에서 명시적으로 뒤집은 뒤에만.

| Namespace / PVC                                 | 용량   | 제외 이유        |
| ----------------------------------------------- | ------ | ---------------- |
| `qbittorrent/qbittorrent-incomplete-downloads`  | 300 Gi | 미완성 토렌트    |
| `qbittorrent/qbittorrent-modcache`              | 100 Mi | 캐시             |
| `jellyfin/jellyfin-cache`                       | 10 Gi  | 캐시             |
| `monitoring/grafana`                            | 5 Gi   | IaC/재설치로 복구 |
| `monitoring/storage-loki-0`                     | 20 Gi  | 로그             |
| `monitoring/storage-tempo-0`                    | 10 Gi  | 트레이스         |
| `monitoring/server-volume-victoria-metrics-...` | 20 Gi  | 메트릭           |
| `coder-sysbox-ubuntu/...-data`                  | 100 Gi | Coder 범위 결정: 제외 |
| `coder-sysbox-ubuntu/...-docker`                | 100 Gi | Coder 범위 결정: 제외 |

대역·쿼터는 Lane A/B에 쓴다.

## 목표 아키텍처

```
Pulumi ESC (pCloud OAuth · Crypt 키 · Slack 웹훅)
        ↓ Vault 비의존 K8s Secret
   ┌────┴────┐
Lane A DR          Lane B Media
raft / pg_dump /   snapshot·clone 후 rclone
소형 archive       rclone Crypt 증분
매일·짧은 timeout  낮은 우선·긴 timeout·concurrency 1
   └────┬────┘
        ↓
   pCloud (단일)
   k8s-backup/dr/... | k8s-backup/media/...
```

### 공통 원칙

| 원칙           | 내용                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| Root of Trust  | ESC → K8s Secret. Vault VSO 금지                                                          |
| Zero-knowledge | rclone Crypt. 키는 ESC                                                                    |
| RWO 안전       | Job이 라이브 PVC 멀티마운트 금지. **CSI VolumeSnapshot + 클론** (확정). sidecar 미채택 |
| 큐 분리        | Lane A/B 스케줄·락·우선순위 분리                                                          |
| API 보호       | `--tpslimit` / `--transfers` 보수적. 대용량 `--multi-thread-streams=1`                    |
| 알림           | tools ESC Slack 웹훅 재사용 가능                                                          |

### Lane A

- 산출물: `YYYY-MM-DD_HHmmss` (콜론 없음) + 체크섬.
- **소형 config 확정 (2026-09-15): C** — VolumeSnapshot 클론 → `tar`/`zstd` 단일 아카이브 → rclone Crypt copy. restic/kopia 미사용. Lane B와 도구를 억지로 맞추지 않음.
- Vault snapshot · Postgres dump도 동일하게 “파일 하나 → Crypt copy”.
- Retention 예: 일별 14일 + 주별 4주. 실제 덤프 크기 실측 후 조정.
- MinIO 스테이징: 1차 불필요. 도입 시 버킷 미러만. MinIO PVC 파일 통째 rclone 금지.

### Lane B

- `current/` + `--backup-dir archive/{YYYY-MM-DD_HHmmss}/` 가능.
- Crypt remote는 PVC leaf당 하나. `remote = pcloud:k8s-backup/{cluster}/{lane}/{namespace}/{pvc}`. dest와 `--backup-dir`는 같은 crypt remote 이름.
- **경로 정책 확정 (2026-09-15, cluster 세그먼트 2026-09-16):** 계층형 C.
  - pCloud 웹 평문: `k8s-backup/{cluster}/{lane}/{namespace}/{pvc}/{timestamp}/` 까지.
  - 그 안 파일명·내용: `filename_encryption=standard` + crypt. `directory_name_encryption=false` (timestamp 평문).
- pCloud mtime 대비 `--modify-window 1s` (필요 시 checksum).
- Windows `rclone mount`는 Lane B 탐색용. `vfs-cache-mode full`은 2 Ti에서 위험 → `writes`/`minimal`부터.
- Phase 1 POC에서 `--backup-dir`+동일 crypt remote 동작 검증. 실패 시 이 이슈에서 A로 후퇴 검토.

### 오케스트레이션

PVC는 system / apps / tools에 흩어짐. 전클러스터 annotation 스캐너보다:

1. **플랫폼(Credentials · SnapshotClass · Lease · 공통 스크립트)은 `k8s-workstation-system`** (2026-09-15 확정).
2. **백업 CronJob/Job은 워크로드 소유 스택** (system=Vault, apps=Jellyfin, tools=qBit/Vikunja/Coder).
3. Lane별 Lease로 concurrency=1.
4. `backup.apexcaptain.com/*` annotation은 문서화·선택적 override 정도.
5. POC용 `BackupPocComponent`는 **삭제됨** (2026-09-15). 라이브 `backup-poc` NS도 삭제됨.

### 구현 슬라이스 C (2026-09-15 확정)

Job 없이 플랫폼만:

| 조각 | 위치 |
|---|---|
| ESC `pcloudBackup` | `common/nexus/src/esc/k8s-workstation-system.esc.ts` |
| sync 매핑 | `scripts/sync-pulumi-esc.script.ts` ← `PCLOUD_*` |
| Platform | `.../pcloud-backup/` — NS · Secret · ConfigMap(`clusterName`) · Lease `dr`/`media` · `longhorn-snap` |
| contract output | `namespace` / `configMapName` / `credentialsSecretName` / `drLeaseName` / `mediaLeaseName` / `volumeSnapshotClassName` |

**워크로드 Job:** tools 등 — platform 이름만 StackReference. credentials·clusterName 값 재주입 없음.

Jellyfin 백업 Job은 apps 스택에 둔다.

## 접근 비교 — RWO 읽기

| 안                              | 내용                      | 장점                   | 단점                       |
| ------------------------------- | ------------------------- | ---------------------- | -------------------------- |
| A. CSI VolumeSnapshot + 클론    | 스냅샷 PVC를 Job이 마운트 | 앱과 분리, 정합에 유리 | snapshotter/CRD 도입 필요  |
| B. 워크로드 Pod sidecar         | 같은 볼륨 공유 후 rclone  | 인프라 추가 적음       | 앱 수명·리소스에 묶임      |
| C. Job이 라이브 PVC 직접 마운트 | —                         | 단순해 보임            | RWO Multi-Attach. **폐기** |

**결정 (2026-09-15): A.** CSI VolumeSnapshot + 클론. Job이 라이브 PVC 직접 마운트(C)는 금지. sidecar(B)는 채택하지 않음. Phase 3에서 Longhorn snapshot 경로 도입.

## 미결 (이후 이 이슈에서 결정)

- [x] Lane C 제외 목록 최종 — **확정 A**: incomplete · modcache · jellyfin-cache · monitoring 전부 제외
- [x] Coder workspace 백업 범위 — **확정 B**: `home`만 포함. `data`·`docker` 제외
- [x] Lane B(및 소형 파일) 읽기 — **확정 A**: CSI VolumeSnapshot + 클론. sidecar 미채택
- [x] Crypt 경로 — **확정 C-1 수정 (2026-09-16)**: leaf+`{timestamp}`까지 평문. `directory_name_encryption=false`, 파일명만 encrypt
- [x] 소형 config — **확정 C**: tar/zstd 아카이브 → rclone Crypt copy. restic/kopia 미사용
- [x] pCloud 계정·용량·OAuth — **확정 D**: 계정 있음, 유료 미결제, 무료 **3 GB**. 결제 전 최소 PVC로 POC. Lane B는 용량 확인·결제 후

### Phase 0 결정 요약

| 안건 | 결정 |
|---|---|
| Lane C | incomplete·cache·monitoring·coder data/docker 제외 |
| Coder ws | `home`만 |
| RWO 읽기 | CSI VolumeSnapshot + 클론 |
| Crypt 경로 | leaf+timestamp 평문 (`directory_name_encryption=false`), 파일명·내용 crypt |
| 소형 config | tar/zstd → Crypt copy |
| pCloud | 무료 3 GB로 POC → 검증 후 결제·Lane B |

## 롤아웃

### Phase 0 — 방침

미결 체크리스트 확정 완료 (2026-09-15).

### Phase 1 — POC (무료 3 GB)

전제: 결제 전. 업로드 합이 3 GB 안에 들어오게.

#### 로컬 시크릿 (`\.secrets/.pulumi/.env/pcloud.env`)

pCloud 웹에서 “API 키 발급” 메뉴를 찾는 구조가 아니다. **rclone OAuth** + **직접 만든 Crypt 암호**다.

| env 키 | 어디서 오나 | 필수 |
|---|---|---|
| `PCLOUD_OAUTH_TOKEN` | rclone이 브라우저 로그인 후 주는 JSON (`access_token` 포함) | 예 |
| `PCLOUD_HOSTNAME` | 계정 리전. US `api.pcloud.com` / EU `eapi.pcloud.com` | 예 (모르면 US 기본, 실패 시 EU) |
| `PCLOUD_CRYPT_PASSWORD` | **직접 생성** (긴 랜덤). pCloud 사이트 값 아님 | 예 |
| `PCLOUD_CRYPT_PASSWORD2` | **직접 생성** (위와 **다른** 긴 랜덤). rclone salt | 예 |

불필요 (일반 rclone pCloud): `client_id` / `client_secret` (비워도 됨). pCloud 로그인 비밀번호를 env에 넣을 필요 없음 (OAuth면 충분. `cleanup` 전용일 때만 username/password).

**토큰 받는 법**

1. 로컬에 rclone 설치.
2. `rclone config` → `n` (new) → 이름 예: `pcloud` → 스토리지 `pcloud`.
3. Client Id / Secret → Enter(빈 값).
4. 브라우저 로그인·허용. (원격/헤드리스면 `rclone authorize "pcloud"` 후 토큰 붙여넣기.)
5. advanced에서 hostname 확인 (EU면 `eapi.pcloud.com`).
6. `~/.config/rclone/rclone.conf`의 `[pcloud]` 안 `token = {...}` 한 줄 전체를 `PCLOUD_OAUTH_TOKEN`에.
7. 같은 블록 `hostname`이 있으면 `PCLOUD_HOSTNAME`에.

**Crypt 암호 만드는 법**

```bash
openssl rand -base64 32   # → PCLOUD_CRYPT_PASSWORD
openssl rand -base64 32   # → PCLOUD_CRYPT_PASSWORD2 (다른 값)
```

- 이 두 값은 **분실 시 백업 복호화 불가**. 패스워드 매니저에도 보관.
- env/ESC에는 **평문**으로 두고, Job/`rclone.conf`에 넣을 때 `rclone obscure` 하면 됨.
- pCloud Crypto Drive(공식 클라이언트 암호화)와 **호환 안 됨**. rclone Crypt만 씀.

**env 예시 (값은 채우지 말 것 — 형식만)**

```bash
PCLOUD_HOSTNAME=api.pcloud.com
# JSON 토큰은 반드시 single-quote. bash source 시 따옴표 깨짐 방지
PCLOUD_OAUTH_TOKEN='{"access_token":"...","token_type":"bearer","expiry":"0001-01-01T00:00:00Z"}'
PCLOUD_CRYPT_PASSWORD=
PCLOUD_CRYPT_PASSWORD2=
```

ESC 스키마·`sync-pulumi-esc` 매핑은 Phase 2. Phase 1 POC는 위 env(또는 로컬 rclone.conf)만으로 가능.

권장 순서:

1. 로컬(또는 Job)에서 **합성 소량 디렉터리**로 Crypt C-1 + `--backup-dir` 검증 (용량 거의 0)
2. 실 PVC 최소: `qbittorrent/qbittorrent-config` (**200 Mi** 할당). 스냅샷 전엔 RWO 제약을 이 이슈에서 임시 합의(예: 앱 중지 창·또는 읽기 전용 수단) 후 tar
3. 여유 있으면 Vault raft snapshot **실측 크기** 확인 후, 3 GB 안에 들어갈 때만 업로드

하지 않음 (3 GB·미결제): jellyfin-config 5 Gi, Lane B 전부. vikunja-data 2 Gi는 retention 겹치면 위험 — POC 대상에서 제외.

- [x] rclone Crypt C-1 + pCloud 소규모 검증 — 클러스터 POC 통과 후 NS·컴포넌트 정리
- [x] `script:syncPulumiEsc` + system `pulumi up`으로 Platform 적용
- [x] VolumeSnapshot / external-snapshotter 도입 후 SnapshotClass — Piraeus 5.2.0 + `longhorn-snap` 적용
- [x] 첫 Backup Job — qBit `qbittorrent-config` 일회 POC 업로드 성공 후 **컴포넌트 삭제** (정식은 CronJob에서)
- [ ] CronJob 스케줄 + `pcloud-backup-dr` Lease (qBit config: 01:00 Asia/Seoul, keepWithin 2d — 설정 확정, 배포·모니터링 대기)
- [ ] Vault raft Backup Job
- [ ] Windows mount 복호화 (선택)
- [ ] 유료 플랜 결정 트리거: Lane B 전

**POC 노트**

- 토큰 JSON은 `PCLOUD_OAUTH_TOKEN='{...}'` single-quote.
- pCloud 웹 `k8s-backup/poc`는 수동 삭제.

### Phase 2 — Lane A

- [x] ESC + K8s Secret (Platform 적용으로 완료)
- [ ] Vault raft snapshot → pCloud
- [ ] Postgres dump → pCloud
- [ ] 소형 config 아카이브
- [ ] 복구 런북 초안
- [ ] Slack 실패 알림

### Phase 3 — RWO 읽기

- [x] VolumeSnapshot + 클론 구축 (sidecar 아님) — snapshot-controller + `longhorn-snap` 적용. Job 실증은 다음
- [ ] jellyfin-config 등으로 실증

### Phase 4 — Lane B (유료 플랜 이후)

- [ ] jellyfin-media / qbit-complete / coder home 최초 sync
- [ ] Lane A와 스케줄·락 분리 확인
- [ ] archive retention Job

### Phase 5 — (선택) 이중화

- [ ] Lane A 사본만 R2 또는 OCI Always Free 미러

## 수용 기준

- [ ] Vault sealed/장애 시에도 ESC Secret만으로 Lane A Job 기동 가능
- [ ] raft snapshot으로 빈 Vault 복구 절차가 런북에 있고 한 번 연습됨
- [ ] 각 Postgres dump로 빈 DB 복원 가능
- [ ] Lane B 최초 sync 중에도 Lane A 일일 Job 성공
- [ ] pCloud에서 dr / media 경로 구분 가능
- [ ] 합의된 제외 PVC는 업로드되지 않음

## 범위 밖

- R2/OCI를 1차 필수 백엔드로 쓰는 것
- MinIO를 필수 스테이징으로 두는 것 (후속 검토만)
- pCloud Crypto(전용 앱) 의존. rclone Crypt만

## 타임라인

| 일시       | 내용                                              |
| ---------- | ------------------------------------------------- |
| 2026-09-15 | 등록. PVC 인벤토리·Lane A/B 구성안·미결 목록 작성 |
| 2026-09-15 | Lane C 확정: incomplete·modcache·jellyfin-cache·monitoring 전부 제외 |
| 2026-09-15 | Coder workspace 확정 B: home만 백업. data·docker 제외 |
| 2026-09-15 | RWO 읽기 확정 A: CSI VolumeSnapshot + 클론. sidecar 미채택 |
| 2026-09-15 | Crypt 경로 확정 C-1: leaf까지 평문, 내부 directory_name_encryption=true |
| 2026-09-15 | 소형 config 확정 C: tar/zstd → rclone Crypt copy. restic/kopia 미사용 |
| 2026-09-15 | pCloud 확정 D: 계정 있음·유료 미결제·무료 3 GB. Phase 1=최소 PVC POC. Lane B는 결제 후. Phase 0 종료 |
| 2026-09-15 | Phase 1 시크릿 키 정리: PCLOUD_OAUTH_TOKEN·HOSTNAME·CRYPT_PASSWORD·PASSWORD2. pcloud.env 플레이스홀더 |
| 2026-09-15 | `pcloud.env` 4키 주입 완료. 다음: 합성 디렉터리 Crypt C-1 POC |
| 2026-09-15 | 클러스터 POC 통과: ns `backup-poc`, PVC 128Mi, 100Mi upload → `k8s-backup/poc/backup-poc-data`. 토큰 env 따옴표 이슈 수정 |
| 2026-09-15 | 클러스터 POC 정리: `backup-poc` Namespace 삭제. pCloud `k8s-backup/poc`는 웹에서 수동 삭제 |
| 2026-09-15 | Pulumi 배치 확정: Credentials+Platform=`k8s-workstation-system`. Job은 워크로드 소유 스택 |
| 2026-09-15 | 슬라이스 C 확정. `backup-poc` 컴포넌트 삭제. ESC+Platform 코드 추가 (SnapshotClass·Job 제외). sync/up 적용 대기 |
| 2026-09-15 | 큐 이름 `laneA/B` → `dr` / `media` (pCloud 경로·역할과 일치) |
| 2026-09-15 | system `pulumi up` 성공: +5 create (NS/Secret/Lease×2/Component). 클러스터 실측 확인 |
| 2026-09-15 | snapshotter A 확정: Piraeus Helm `snapshot-controller` 5.2.0 + Platform `longhorn-snap` (`type: snap`, default). sync/up 대기 |
| 2026-09-15 | system `pulumi up` 성공: snapshot-controller + `longhorn-snap` 생성. 클러스터 실측 확인 |
| 2026-09-15 | qBit config 일회 Job 통과: VS→클론→`tar.zst` 6.1MiB → Crypt `k8s-backup/dr/qbittorrent-config/`. alpine+worker.sh. CronJob·Lease·tools Pulumi state 정렬 남음 |
| 2026-09-16 | `QbittorrentConfigBackupComponent` 정리: 스크립트 `assets/qbittorrent-config-backup/`, clone SC/size args, stub 제거 |
| 2026-09-16 | 오해 정정: 일회 Job 컴포넌트·assets·클러스터 SA/Secret/CM/Job **삭제**. POC 검증만 남김. pCloud 산출물은 수동 삭제 |
| 2026-09-16 | 경로 확정: `k8s-backup/{cluster}/{lane}/{namespace}/{pvc}/{timestamp}`. retention=`keepWithin`만 (예 14d). qBit `QbittorrentBackupComponent` CronJob 초안 (미배포) |
| 2026-09-16 | Lane A 공통을 `@common/custom-resources` `PvcSnapshotArchiveV1`로 추출. 스크립트 `templates/pvc-snapshot-archive.v1/`. qBit는 thin wrapper |
| 2026-09-16 | clusterName·credentials SSOT=platform. tools는 ConfigMap/Secret 이름만. Job이 platform Secret 읽고 worker용 ephemeral Secret 복사 |
| 2026-09-16 | 점검 후 정리: PLATFORM_NS, DNS-1123 짧은 run token, lease resourceVersion, ephemeral Secret 제거(base64 env), RBAC 축소, credentialsSecretKeys 제거 |
| 2026-09-16 | qBit Phase 1 설정 확정: target `config`, `CronTime.everyDayAt(1)` Asia/Seoul, `keepWithin=2d`. 배포 후 의도대로 도는지 모니터링 |
| 2026-09-16 | `runOnceOnCreate` 추가 (기본 false). qBit contract는 Phase 1 확인용 true — 통과 후 false |
| 2026-09-16 | 사용자 배포 진행 (system ConfigMap 먼저 → tools). once Job·Cron·pCloud 경로 모니터링 |
| 2026-09-16 | once Job Lease stuck: MicroTime에 `…Z` 불가 → `…000000Z` 필요. run.sh 수정. ConfigMap 재배포 후 once 재실행 |
| 2026-09-16 | 실패 Job 삭제 → tools refresh/up. script CM replace + once Job 재생성 **성공** (~92s, exit 0) |
| 2026-09-16 | Crypt: timestamp도 웹 평문 원함 → `directory_name_encryption=false`. 기존 난독 폴더는 수동 삭제 권장 |
| 2026-09-16 | timestamp 평문 적용 재배포: CM replace + once Job **성공** (~96s). path `…/qbittorrent-config/{ts}/` 웹 확인 |
| 2026-09-16 | TIMESTAMP·prune를 `Asia/Seoul`로. orch에 `tzdata` 추가 |
| 2026-09-16 | once 검증 종료 → `runOnceOnCreate=false`. ~3일 후 Cron·keepWithin=2d 확인 예정 |
