# Jellyfin 12 업그레이드 (차트 3.4.0) — SSO 플러그인 호환 대기

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-21 |
| **영역** | apps 스택 Jellyfin (`jellyfin` 네임스페이스), Authentik SSO |
| **관련 코드** | `common/utils/src/configs/versions.config.ts` (`helmChartVersions.jellyfin`), `infra/k8s-workstation-apps/src/components/jellyfin/jellyfin.helm-chart.component.ts`, `jellyfin.authentik.component.ts` |
| **상태** | **해결** — Jellyfin 12.4.0 (차트 3.7.0) + SSO MaxRink fork 6.1.0.0 |
| **해결일** | 2026-11-22 |

## 해결 요약

- 원본 SSO 플러그인(9p4)이 2026-05-12 아카이브돼 기존 트리거가 소멸. 같은 GUID·라우트의 MaxRink fork 6.1.0.0으로 전환
- 미사용 확인된 EDL Creator·ThePornDB 제거. Session Cleaner 6.0·TMDb Box Sets 15.0으로 갱신
- 내장 백업이 5GiB 여유 공간을 요구해 config PVC 5Gi → 10Gi. 내장 백업 + Longhorn 스냅샷 후 차트 3.7.0 배포. 차트 3.5+ `/media` readOnly 기본값은 `readOnly: false`로 막음
- 마이그레이션 39개 성공, 재스캔, ApexCaptain SSO 링크 이메일 키로 이전 확인, NVENC·SFTP sidecar 정상. PR #219로 develop 반영
- 사용자 요청으로 남은 항목이 있는 채로 닫음 (아래 "닫을 때 남긴 항목")

### 닫을 때 남긴 항목

이 레포에서 추적하지 않는다. 필요하면 Jellyfin에서 직접 처리한다.

- ApexCaptainCorp·azure153 SSO 링크 이전 — 각자 다음 SSO 로그인 때 fork가 자동 처리
- 롤백 자원 정리: Longhorn 스냅샷 `longhorn/jellyfin-config-pre-12-upgrade-20261122`, `/config/plugins-removed-20261122/`, `/config/config/system.xml.pre-12-20261122`, `/config/data/backups/jellyfin-backup-20261122022454.zip`
- (선택) `영화` 라이브러리 fetcher 순서의 ThePornDB 이름, 미사용 intro-skipper 레포 항목

## 배경

Nova 진단(2026-10-21)에서 jellyfin 차트 3.2.0 → 3.4.0이 outdated로 잡혔다. cilium을 뺀 나머지 차트를 순서대로 올리는 작업에서 Jellyfin만 따로 뺐다.

차트 values에 `image.tag`가 없어서 이미지는 차트 `appVersion`을 따른다. 차트를 올리면 앱이 **10.11.8 → 12.2**로 같이 올라간다.

## 문제

[Jellyfin 12.0 릴리스 노트](https://github.com/jellyfin/jellyfin/releases/tag/v12.0) 기준:

- DB 스키마가 바뀐다. 전체 백업을 복원하지 않으면 되돌릴 수 없다
- 서드파티(레포) 플러그인은 마이그레이션 전에 제거하라고 권한다
- 업그레이드 후 전체 라이브러리 재스캔이 필수다 (자동 감지된 alternative version이 지워짐)
- 레거시 경로(`/emby/*`, `/mediabrowser/*`)와 레거시 인증이 빠졌다
- 대소문자만 다른 사용자명은 업그레이드 전에 정리해야 한다

설치된 플러그인 (`/config/plugins`, 2026-10-21):

| 플러그인 | 버전 |
|---|---|
| SSO Authentication | 4.0.0.4 |
| ThePornDB | 1.6.0.11 |
| EDL Creator | 0.5.0.0 |
| Session Cleaner | 5.0.0.0 |
| TMDb Box Sets | 13.0.0.0 |

**막는 조건**: [9p4/jellyfin-plugin-sso](https://github.com/9p4/jellyfin-plugin-sso) manifest의 최신 버전 4.0.0.4가 `targetAbi 10.11.0.0`이다. 12용 빌드가 없다. 지금 올리면 Authentik SSO 로그인이 끊긴다.

## 차트 3.2.0 → 3.4.0 변경 (앱 제외)

추가 기능 위주다 (deploymentLabels, PVC labels/nfs 타입, ingress backend service, HTTPRoute filters, NetworkPolicy podSelector가 `matchLabels` 형태로 바뀜). 우리는 `persistence.*.existingClaim`을 쓰고 NetworkPolicy·ingress는 안 쓰므로 템플릿 변경 영향은 작다.

## 접근 비교

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| A | SSO 플러그인이 12를 지원할 때까지 보류 | 위험 없음 | 차트도 3.2.0에 머묾 |
| B | `image.tag: 10.11.8` 고정 + 차트만 3.4.0 | 차트 최신, 앱은 그대로 | 이미지 태그 수동 관리 지점이 하나 늘어남 |
| C | 백업 후 12.2로 업그레이드, SSO는 임시로 끔 | 최신 | SSO 끊김, 되돌리기 어려움 |

**추천**: A. 트리거가 오면 아래 순서로 진행한다. 차트만 먼저 올리고 싶으면 B를 별도로 진행한다.

## 재조사 (2026-11-22)

### 클러스터

| 항목 | 값 |
|---|---|
| Pod | `jellyfin-76d7d8cfb-n62hw` 3/3 Running, 9d, 재시작 0 (sidecar 모드) |
| 버전 | 차트 3.2.0 / 앱 10.11.8. values는 `image.pullPolicy`만 있고 `tag` 없음 |
| config PVC | 4.9G 중 2.1G 사용 (여유 2.8G). `jellyfin.db` 20MB, `/config/data` 1.4G |
| 백업 | `jellyfin-backup-dr-config` Job 23h 전 Completed (pCloud DR lane) |
| 플러그인 레포 | Jellyfin Stable, intro-skipper, ThePornDB, SSO(9p4) |

설치된 플러그인 5개는 전부 `targetAbi 10.11.x`다. `/config/plugins/configurations`에 IntroSkipper·ChapterCreator 등 미설치 플러그인 설정 xml이 남아 있다 (영향 없음).

### upstream

- Jellyfin 최신 **12.4** (2026-10-26). 12.1·12.2에 마이그레이션 버그 수정 (pre-migration backup 무결성, ChangeOwnerIdToGuid 성능, EncoderPreset null). 10.11.x → 12.x 직접 업그레이드 지원
- 차트 최신 **3.7.0** (appVersion 12.4). 3.4.0 = 12.2
- 12.0에 `--mode MigrateSystem` 플래그 추가 (서버 기동 없이 마이그레이션만 실행)

### SSO 플러그인 — 기존 트리거 소멸

[9p4/jellyfin-plugin-sso](https://github.com/9p4/jellyfin-plugin-sso)는 **2026-05-12 아카이브**됐다 (README: "Project archived because I'm tired of working on this"). 12용 빌드는 영영 안 나온다. 기존 트리거("manifest에 12 `targetAbi` 등장")는 충족될 수 없다.

12를 지원하는 대안:

| 후보 | 최신 | targetAbi | GUID | 비고 |
|---|---|---|---|---|
| [MaxRink fork](https://github.com/MaxRink/jellyfin-plugin-sso) | 6.1.0.0 (2026-09-11). main은 6.3.0.0, 마지막 커밋 2026-10-21 | 12.0.0.0 | 원본과 동일 | ★30. "maintained fork", 여러 fork 수정 통합. 라우트 `/sso/OID/redirect·start/{provider}` 유지. 6.0부터 OpenID 링크를 `sub` 기준으로 저장하고 기존 링크는 다음 로그인 때 마이그레이션. 비인증 `?isLinking=true` 시작 거부. 네이티브 모바일 앱 로그인 지원 |
| [Buco7854 fork](https://github.com/Buco7854/jellyfin-plugin-sso) | 5.0.0.3 (2026-10-07) | 12.0.0.0 | 동일 | ★65. README가 "개인 용도, best-effort"라고 명시 |
| [danbro96 fork](https://github.com/danbro96/jellyfin-plugin-sso) | 5.0.0.0 (2026-09-22) | 12.0.0.0 | 동일 | ★1. 같은 GUID라 제자리 설치·설정 보존이라고 명시 |
| [be-nj/jellyfin-sso](https://github.com/be-nj/jellyfin-sso) | 1.12.23 (2026-11-18) | 12 | 별개 플러그인 | ★6. 새 구현. 라우트·설정 호환 없음, 재설정 필요 |
| LDAP Authentication (stable) + Authentik LDAP outpost | 24.0.0.0 | 12.0.0.0 | — | 공식 플러그인. 원클릭 SSO 아님 (ID/PW 입력). outpost 추가 운영 필요 |

fork 3종은 GUID가 같아 `SSO-Auth.xml` 설정을 이어받을 가능성이 높다. 실제 호환은 업그레이드 때 확인해야 한다 (가설).

### 나머지 플러그인 12 호환

| 플러그인 | 현재 | 12 호환 | 출처 |
|---|---|---|---|
| Session Cleaner | 5.0.0.0 | **있음** 6.0.0.0 (12.0) | stable |
| TMDb Box Sets | 13.0.0.0 | **있음** 15.0.0.0 (12.1) | stable |
| ThePornDB | 1.6.0.11 | **manifest 없음**. 2026-09-10 "update to jellyfin 12" 커밋 + `latest` prerelease zip만 있음 | ThePornDB repo |
| EDL Creator | 0.5.0.0 | **없음**. intro-skipper 12.0 manifest에 항목은 있으나 버전 0개. 레포 마지막 push 2025-10-22 | intro-skipper |

**EDL Creator는 제거로 결정 (2026-11-22)**. 이 플러그인은 Jellyfin media segment를 외부 플레이어(Kodi·MPV)용 `.edl` 파일로 써 주는 역할만 한다. Jellyfin 클라이언트는 10.10부터 segment를 직접 쓰므로 필요 없다. 실측 결과 쓰고 있지 않았다:

- `/media` 전체에 `.edl` 파일 0개
- segment를 만드는 Intro Skipper 미설치 (설정 xml만 남음)
- 플러그인 설정은 기본값(`CommercialEdlAction`만, `SelectedLibraries` 비어 있음), 2026-06-20 이후 수정 없음

외부 플레이어에서 구간 건너뛰기가 필요해지면 Intro Skipper(12.0.6.0, 12 지원)와 함께 다시 본다.

**ThePornDB도 제거로 결정 (2026-11-22)**. 실측 결과 쓰고 있지 않았다:

- 켜진 라이브러리 없음. `영화`의 `MetadataFetcherOrder`·`ImageFetcherOrder`에만 이름이 있고, 켜진 `MetadataFetchers`는 TheMovieDb·OMDb뿐
- `포르노` 라이브러리(`/media/porn`)는 homevideos 유형이라 원격 메타데이터를 받지 않음 (Nfo 읽기 + Embedded Image Extractor·Screen Grabber만)
- API 토큰 미설정 (설정 xml에 토큰 키 없음). 설정은 2026-06-20 이후 수정 없음

참고로 `latest` prerelease(2026-09-10)는 빌드 대상만 바꿨다 (`net10.0`, `Jellyfin.Controller` 12.0.0). 기능 코드는 그대로다. 다만 manifest 밖이라 수동 설치·자동 업데이트 불가이고, 버전 번호가 1.6.0.11로 기존과 같아 구분이 안 된다.

다시 필요해지면 정식 manifest에 12용이 올라온 뒤 토큰 설정 + 라이브러리 유형을 Movies로 바꾸고 소스를 켠다. 대안은 같은 작성자의 [Stash 플러그인](https://github.com/DirtyRacer1337/Jellyfin.Plugin.Stash)인데, Stash 서버를 따로 운영해야 한다.

### 미디어 PVC 백업 범위

업그레이드 전에 미디어 PVC(`/media`, 2.0T 중 1.2T)를 따로 백업하지 않는다. 백업 대상은 config PVC만이다.

- 12 마이그레이션은 `/config`의 DB만 바꾼다. 미디어 파일은 읽기만 한다
- 라이브러리 7개 중 6개가 `SaveLocalMetadata=false`라서 nfo·이미지를 미디어 폴더에 쓰지 않는다. `true`인 곳은 `컬렉션`뿐이고, 컬렉션(BoxSet) 메타데이터는 `/config` 쪽에 저장된다
- 자막은 `SaveSubtitlesWithMedia=true`라 미디어 옆에 저장되지만, 재스캔은 이 파일을 지우지 않는다
- 미디어 DR은 별도 이슈 범위다 ([pCloud PVC 백업](2026-09-15-pcloud-pvc-encrypted-backup.md) Lane B `jellyfin-media`)

### 접근 비교 (갱신)

이전 비교표(A/B/C)는 원본 플러그인이 12를 지원한다는 전제였다. 그 전제가 깨져서 다시 비교한다.

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| A' | MaxRink fork로 교체 + 12.x 업그레이드. EDL Creator는 제거, ThePornDB는 prerelease 또는 재지원까지 제거 | 같은 GUID·같은 라우트라 Authentik(IaC) 변경 없음. 가장 활발한 fork | fork 유지보수 리스크. 링크 `sub` 마이그레이션 검증 필요 |
| B | `image.tag: 10.11.8` 고정 + 차트만 3.7.0 | 지금 위험 없음 | 10.11 보안 패치 종료 시점까지 시간 벌기일 뿐. 원본 SSO는 어차피 안 고쳐짐 |
| D | 10.11.8 유지, 그대로 보류 | 변경 없음 | 해결 트리거가 없음. 차트·앱 계속 뒤처짐 |
| E | LDAP 플러그인 + Authentik LDAP outpost | 공식 플러그인 | 원클릭 SSO 상실, outpost 운영 추가 |

**추천**: A'. 먼저 EDL Creator 없이 지낼 수 있는지 정한다. 정하기 전에 차트만 올리고 싶으면 B를 따로 진행한다. fork는 12용(6.x)만 쓴다. 10.11에서 미리 갈아끼우지 않는다.

## 진행 순서 (A', 2026-11-22)

1. 결정: SSO fork(MaxRink 추천). EDL Creator·ThePornDB는 제거로 결정됨
2. 대소문자만 다른 사용자명 점검, admin 로컬 로그인 동작 확인 (SSO 장애 복구용)
3. config PVC 백업 (Longhorn 스냅샷 + Jellyfin 내장 백업). 여유 2.8G라 내장 백업 크기 먼저 확인. 미디어 PVC는 백업 대상 아님 (위 "미디어 PVC 백업 범위")
4. 서드파티 플러그인 전부 제거 (SSO, ThePornDB, EDL Creator). 레포 목록에서 ThePornDB·9p4 SSO를 빼고 fork manifest 추가. `영화` 라이브러리 fetcher 순서의 ThePornDB 항목은 플러그인 제거 후 정리
5. `helmChartVersions.jellyfin` 3.7.0 (또는 그때 최신) → apps 스택 preview → up
6. 마이그레이션 로그 확인 → 전체 라이브러리 재스캔
7. stable 플러그인 업데이트 (Session Cleaner 6.0, TMDb Box Sets 15.0), fork SSO 6.x 설치 → `SSO-Auth.xml` 설정 유지 확인 → Authentik 로그인·기존 계정 링크 확인
8. `jellyfin.authentik.component.ts` 주석의 9p4 manifest URL을 fork URL로 갱신

### 2단계 점검 결과 (2026-11-22)

**SSO는 MaxRink fork로 결정.** DB(`jellyfin.db` 복사본, 읽기 전용)와 `SSO-Auth.xml`(시크릿 제외)로 점검했다.

| 항목 | 결과 |
|---|---|
| 대소문자만 다른 사용자명 | **없음**. 사용자 4명: `admin`, `ApexCaptain`, `ApexCaptainCorp`, `azure153` |
| 인증 provider | 4명 모두 `DefaultAuthenticationProvider`, 비밀번호 있음, 비활성 0명 |
| admin | 관리자는 `admin` 1명. 로컬 provider, 마지막 로그인 2026-10-15. **비밀번호로 실제 로그인되는지는 사용자 확인 필요** |
| 로그인 화면 | 4명 모두 `IsHidden=1`. 로그인 화면에 목록이 안 뜨므로 "수동 로그인"으로 사용자명을 직접 입력해야 함 |
| SSO 링크 | provider `authentik` 1개, `CanonicalLinks` 3개 (ApexCaptain·ApexCaptainCorp·azure153). 사용자명 기준 링크 |
| Authentik `sub` | `subMode: 'user_email'` (`jellyfin.authentik.component.ts`). sub = 이메일 |

fork 6.x 영향:

- 사용자명 기준 링크 3개는 다음 SSO 로그인 때 `sub`(이메일) 기준으로 자동 마이그레이션된다 (README). 첫 로그인 후 기존 계정에 붙었는지, 새 계정이 생기지 않았는지 확인한다
- sub가 이메일이므로 Authentik에서 사용자 이메일을 바꾸면 링크가 끊긴다. 바꿀 일이 생기면 `/SSOViews/linking`에서 다시 링크한다
- 6.0부터 링크는 로그인된 상태에서 `/SSOViews/linking`에서만 시작할 수 있다 (`?isLinking=true` 비인증 시작 거부)
- fork의 [identity-migration](https://github.com/MaxRink/jellyfin-plugin-sso/blob/main/docs/identity-migration.md)(sub 전용 식별 + 수동 라이브러리 grant)은 opt-in 오프라인 도구다. 설치만으로는 적용되지 않는다. 이번 범위에서는 하지 않는다

### 3단계 진행 (2026-11-22)

- admin 로컬 비밀번호 로그인: 사용자 확인 완료
- 내장 백업(Database + 메타데이터) 생성 **실패**: `The backup directory '/config/data/backups' does not have at least '5GiB' free space`. `BackupService.CreateBackupAsync`가 백업 경로(`{DataPath}/backups` = config PVC) 여유 공간을 5GiB 이상 요구한다 (10.11.8·12.4 동일). config PVC가 5Gi(여유 2.8G)라 백업을 만들 수 없다
- 12 마이그레이션 영향 확인 (v12.4 `JellyfinMigrationService.PrepareSystemForMigration`): 마이그레이션 전 자동 백업은 `JellyfinDb` 백업(DB 파일 복사)만 요구한다. Metadata·Trickplay·Subtitles 전체 백업을 요구하는 routine은 없어 5GiB 검사는 타지 않는다. 그래도 내장 백업은 우리 롤백 수단이라 필요하다
- 조치: config PVC 5Gi → **10Gi** (`infra/k8s-workstation-apps/src/contract.ts` `pvc.jellyfinConfig.size`). StorageClass `longhorn-ssd-retain`은 `allowVolumeExpansion: true`, SSD 디스크 스케줄 여유 약 367G, 레플리카 1. preview: PVC in-place update 1건(교체 없음) + 컴포넌트 출력 1건. 확장은 되돌릴 수 없다 (축소 불가)
- 적용: `pulumi up` 후 온라인 확장. `/config` 9.8G, Pod 재시작 없음
- 내장 백업 **완료**: `/config/data/backups/jellyfin-backup-20261122022454.zip` (726MiB, 4135 항목). zip 무결성 OK, manifest `ServerVersion 10.11.8.0`, Options `Database·Metadata=true`, `Trickplay·Subtitles=false`
- Longhorn 스냅샷 **완료**: `longhorn/jellyfin-config-pre-12-upgrade-20261122` (2026-11-22T02:28:12Z, readyToUse=true). 내장 백업 zip 생성 뒤에 찍어 zip도 포함. 업그레이드가 끝나고 안정화되면 수동 삭제
- 롤백 경로: (1) 12 기동 실패 시 차트 3.2.0 복귀 + Longhorn 스냅샷 revert, (2) 또는 10.11.8에서 내장 백업 restore

### 4단계 (2026-11-22)

파일 단위로 처리했다 (대시보드 제거와 결과 동일. 실행 중 프로세스는 재시작 때까지 기존 플러그인 유지).

- `/config/plugins/`의 `SSO Authentication_4.0.0.4`, `ThePornDB_1.6.0.11`, `EDL Creator_0.5.0.0` → `/config/plugins-removed-20261122/`로 이동 (삭제 아님, 되돌리기 가능)
- `system.xml` 레포 목록: ThePornDB 삭제, `SSO` → `SSO (MaxRink)` + MaxRink manifest URL. 원본은 `system.xml.pre-12-20261122`
- `plugins/configurations/SSO-Auth.xml`은 그대로 둠 (fork가 같은 GUID·이름이라 재사용)
- intro-skipper 레포는 남아 있다 (미사용. 정리는 선택)

### 5단계 준비 (2026-11-22)

- `helmChartVersions.jellyfin` 3.2.0 → 3.7.0 (앱 12.4). `common/utils` lib 재컴파일
- **차트 3.5+ 함정**: `persistence.media.readOnly` 기본값이 `true`라 `/media`가 읽기 전용으로 마운트된다 (`helm template`로 확인). 자막 저장 등 쓰기를 위해 `jellyfin.helm-chart.component.ts`에 `readOnly: false` 명시
- 그 밖 템플릿 변경: startupProbe 추가 (tcp, 최대 5분), NetworkPolicy podSelector `matchLabels`, nfs·labels 옵션. 우리 설정에 영향 없음
- 배포 전략 RollingUpdate `maxSurge 0` / `maxUnavailable 1` — 기존 Pod 종료 후 새 Pod 기동 (GPU·RWO 충돌 없음)
- preview: Helm Release update 1건(version + `media.readOnly`) + 컴포넌트 출력 1건

### 5단계 결과 (2026-11-22)

- `pulumi up` (2 updated). 새 Pod `jellyfin-fd8d9979-5jvhl` 3/3 Running, 재시작 0, 차트 3.7.0 / **Jellyfin 12.4.0**
- 마이그레이션: PreInitialisation 1 + CoreInitialisation 22 + AppInitialisation 16 전부 `successfully applied`. 사전 `jellyfin.db` 백업 후 성공 시 자동 정리. `[ERR]` 0건. `Startup complete 0:00:12.5`
  - `AddForeignKeyToOwnerId`에서 EF `rebuild of table 'BaseItems' is pending` WRN 2건 — 이후 성공
  - LinkedChildren 877개 처리·30개 삽입, trickplay 고아 1개 삭제, 나머지 정리 0건
  - `DisableLegacyAuthorization` 적용 (레거시 인증 꺼짐)
- `/web/` 200 (내부·외부), `/System/Info/Public` 12.4.0, `/media` rw 마운트 확인
- stable 플러그인 자동 업데이트: Session Cleaner 6.0.0.0, TMDb Box Sets 15.0.0.0 설치됨 (재시작 후 로드. 지금은 5.0/13.0이 로드된 상태)
- `/sso/OID/start/authentik` 404 — SSO 플러그인 미설치 상태라 예상대로
- 8단계 선반영: `jellyfin.authentik.component.ts` 주석의 manifest URL을 MaxRink로, `sub` 기준 링크 메모 추가

### 6~7단계 결과 (2026-11-22)

- 카탈로그에서 SSO-Auth 6.1.0.0(MaxRink) 설치 → 재시작. `/config/plugins`: `SSO-Auth_6.1.0.0`, `Session Cleaner_6.0.0.0`, `TMDb Box Sets_15.0.0.0` (구버전 폴더 정리됨)
- `SSO-Auth.xml` 설정 유지 확인: provider `authentik`, Endpoint·`Enabled`·`EnableAuthorization` 그대로
- 전체 라이브러리 스캔: 21초 완료, post-scan 9개 성공
- SSO 로그인 (ApexCaptain): `Removing legacy username-keyed SSO link ApexCaptain` → 이메일 키 링크 생성, 기존 사용자 ID로 세션 발급. 사용자 수 4명 그대로 (새 계정 없음). ApexCaptainCorp·azure153 링크는 각자 다음 로그인 때 이전된다
- GPU: 컨테이너에서 RTX 2080 인식 (드라이버 595.99.02), `encoding.xml` `nvenc`. `jellyfin-ffmpeg`로 `h264_nvenc`·`hevc_nvenc` 테스트 인코딩 성공
- SFTP sidecar: ready, 재시작 0, sshd 22번 포트 listen, `/home/<user>/config`·`/media` rw 마운트
- 30분간 `[ERR]` 0건
- 남은 찌꺼기 (무해): `영화` `options.xml`의 fetcher·image fetcher 순서 목록에 ThePornDB 이름 6건. 플러그인이 없어 무시된다. 라이브러리 설정을 다시 저장할 때 정리되는지 확인
- 안정화 후 정리할 것: Longhorn 스냅샷 `jellyfin-config-pre-12-upgrade-20261122`, `/config/plugins-removed-20261122/`, `system.xml.pre-12-20261122`, 내장 백업 zip(726MiB). 미사용 intro-skipper 레포 항목 (선택)

## 진행 순서 (트리거 충족 후, 2026-10-21 원안)

1. SSO 플러그인 manifest에서 12.x `targetAbi` 버전 확인. 나머지 플러그인도 12 호환 확인
2. config PVC 백업 (Longhorn 스냅샷 + Jellyfin 내장 백업)
3. 서드파티 플러그인 제거
4. `helmChartVersions.jellyfin` 3.4.0 (또는 그때 최신) → apps 스택 preview → up
5. 첫 기동 마이그레이션 로그 확인 → 전체 라이브러리 재스캔
6. 플러그인 재설치 (stable repo), SSO 로그인 확인

## 수용 기준

- [x] SSO 플러그인 12 호환 버전 확인 (MaxRink fork 6.1.0.0, `targetAbi 12.0.0.0`. 2026-11-22)
- [x] 업그레이드 전 config 백업 (내장 백업 + Longhorn 스냅샷, 2026-11-22)
- [x] Jellyfin 12.x 기동, 마이그레이션 오류 없음 (12.4.0, 2026-11-22)
- [x] 라이브러리 재스캔 완료 (2026-11-22)
- [x] Authentik SSO 로그인, GPU 트랜스코딩, SFTP sidecar 정상 (2026-11-22. GPU는 NVENC 테스트 인코딩, SFTP는 sshd·마운트 확인. 실제 재생·SFTP 접속은 사용 중 확인)
- [x] SSO fork·EDL Creator·ThePornDB 처리 결정 (2026-11-22 추가. 원본 플러그인 아카이브로 첫 항목은 fork 기준으로 판단)
- [x] 대소문자만 다른 사용자명 없음 (2026-11-22)
- [x] admin 로컬 비밀번호 로그인 실확인 (2026-11-22)
- [ ] fork 첫 SSO 로그인 후 기존 3개 계정 링크 유지 (새 계정 생성 없음) — ApexCaptain 확인 (2026-11-22). ApexCaptainCorp·azure153 남음
- [ ] 안정화 후 롤백 자원 정리 (Longhorn 스냅샷, 격리 플러그인 폴더, `system.xml.pre-*`, 내장 백업 zip)

## 범위 밖

- 다른 Helm 차트 업그레이드 (같은 날 별도 진행)
- Jellyfin ambient mesh 복귀 ([별도 이슈](2026-08-17-jellyfin-ambient-mesh-direct-play-seek.md))

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-21 | 등록. Nova 진단 후 차트 업그레이드 사전 점검에서 SSO 플러그인 비호환 확인, 보류 |
| 2026-11-22 | 재조사. 클러스터 10.11.8 정상. 9p4 SSO 2026-05-12 아카이브 확인, 기존 트리거 소멸. 12 지원 fork(MaxRink·Buco7854·danbro96) 확인. Jellyfin 12.4 / 차트 3.7.0. EDL Creator 12 미지원, ThePornDB prerelease만. 추천 A'로 변경, 결정 대기 |
| 2026-11-22 | EDL Creator 실사용 없음 확인(`.edl` 0개, Intro Skipper 미설치), 제거로 결정. 미디어 PVC는 업그레이드 백업 대상에서 제외 (마이그레이션이 `/config`만 변경, 미디어 폴더 메타데이터 저장 꺼짐) |
| 2026-11-22 | ThePornDB 실사용 없음 확인(켜진 라이브러리 없음, 토큰 없음), 제거로 결정. 남은 결정은 SSO fork 하나 |
| 2026-11-22 | MaxRink fork로 결정, 상태 진행중. 2단계 점검: 대소문자 중복 없음, admin 로컬 provider·비밀번호 있음, SSO 링크 3개(사용자명 기준, fork가 sub 기준으로 자동 이전). admin 실로그인 확인 대기 |
| 2026-11-22 | admin 로그인 확인. 3단계 착수: 내장 백업이 5GiB 여유 공간 검사로 실패. config PVC 10Gi 확장 코드 변경·preview 완료, `pulumi up` 대기 |
| 2026-11-22 | apps 스택 `pulumi up` (2 updated). Longhorn 온라인 확장으로 `/config` 9.8G·여유 7.7G, Pod 재시작 없음 |
| 2026-11-22 | 3단계 완료: 내장 백업 zip(726MiB, 무결성 OK) + Longhorn 스냅샷 `jellyfin-config-pre-12-upgrade-20261122` (ready). 4단계(플러그인 제거) 대기 |
| 2026-11-22 | 4단계 완료 (플러그인 3개 격리 이동, 레포 목록 교체). 5단계: 차트 3.7.0 + `media.readOnly: false` 코드 변경·preview 완료, `pulumi up` 대기 |
| 2026-11-22 | 5단계 완료: 차트 3.7.0 배포, Jellyfin 12.4.0 기동. 마이그레이션 39개 전부 성공, ERR 0. 6~7단계(SSO fork 설치·재시작·재스캔) 대기 |
| 2026-11-22 | 6~7단계 완료: SSO-Auth 6.1.0.0 설치·설정 유지, 재스캔 21초, ApexCaptain SSO 로그인 성공(링크 이메일 키로 이전, 새 계정 없음). NVENC·SFTP sidecar 정상, ERR 0. 상태 적용 — 나머지 2계정 링크 이전·롤백 자원 정리 남음 |
| 2026-11-22 | 사용자 요청으로 해결 처리. 2계정 링크 이전·롤백 자원 정리는 레포 추적 밖으로 남김. `docs/issues/resolved` 이동 |
