# SftpV1 코드 삭제 — 2026-10-21 착수

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-10 |
| **착수일** | **2026-10-21** (원래 재검토 2026-10-31. 사용자: v3 무사고, 조기 진행) |
| **영역** | `SftpV1Component` 코드·테스트. 라이브 SFTP는 이미 v3 |
| **관련 코드** | `common/custom-resources/src/components/adapter/sftp.v1.component.ts`, `test/sftp-v1.test.ts`, `adapter/index.ts` |
| **선행** | [SFTP Adapter v3](2026-09-09-sftp-adapter-v3.md) (해결) |
| **상태** | **해결** |
| **해결일** | 2026-10-21 |

## 해결 요약

v3 라이브 게이트 통과 후 `SftpV1Component`·테스트·export·README 줄을 삭제했다. `pulumi up`·bootstrap Job 없음. `@common/custom-resources` 테스트 10 suite / 27 test 통과.

## 배경

qBit·Jellyfin SFTP는 2026-09-10 기준 `SftpV3Component`다. RaiDrive `current_private` 로그인 확인됨.

`SftpV1Component`는 호출자가 없다. tls `PrivateKey` + ConfigMap 경로. 코드·유닛 테스트만 남음.

바로 지우지 않는다. v3를 한동안 굴려 보고 (분기 rotate 전, 호스트키 TOFU·Reloader·VSO) 문제 없으면 10월 말 이후 삭제한다.

2026-10-21 사용자 판단: v3가 한 번도 문제를 안 일으켰다. 10-31 대기를 접고 오늘 삭제한다.

## 현재 상태

- 라이브: tools qBit `sftpAdapter`, apps Jellyfin `jellyfinSftpAdapter`. 둘 다 v3.
- 레포: `SftpV1Component`·`sftp-v1.test.ts`·v1 export 삭제됨. `rg SftpV1Component` 코드 0건.
- v2는 이미 코드·라이브에서 제거됨.
- `PrivateKeyV1Component`는 Argo git-ops가 쓰므로 **유지**.

## 라이브 게이트 (2026-10-21)

| 대상 | 실측 | 결과 |
|---|---|---|
| qBit pod | `qbittorrent/qbittorrent-7bd4f584bf-j8hhr` 3/3 Running, restart 0 | 통과 |
| Jellyfin pod | `jellyfin/jellyfin-c69bf5f75-t9hvg` 3/3 Running, restart 0 | 통과 |
| qBit VSO | `qbittorrent-sftp-adapter-sftp-host` / `-user` Synced·Healthy·Ready | 통과 |
| Jellyfin VSO | `jellyfin-sftp-adapter-sftp-host` / `-user` Synced·Healthy·Ready | 통과 |
| 매일 reconcile | 양쪽 `sftp-user-reconcile` Completed (당일 03:00 KST 이후) | 통과 |
| 분기 rotate | Jellyfin `sftp-user-rotate` Completed (20일 전, 10-01 cron) | 통과 |
| RaiDrive | 사용자: v3 무사고 | 통과 |
| bootstrap Job | 재실행 없음 (호스트키 TOFU 유지) | 유지 |

## 목표

오늘 코드만 지운다. 라이브 오브젝트·스택 state는 건드리지 않는다.

1. 호출자 0 재확인.
2. v1 컴포넌트·테스트·export 삭제.
3. README 트리에서 v1 파일 줄 제거.
4. `@common/custom-resources` 테스트 통과.

## 계획 (2026-10-21)

코드 삭제. 배포 아님. preview/up 금지. bootstrap Job 재실행 금지.

### 1. 호출자 재확인

```bash
rg -n "SftpV1Component|sftp\\.v1|sftp-v1" --glob '!docs/**' --glob '!**/node_modules/**'
```

기대:

| 남을 곳 | 이유 |
|---|---|
| `sftp.v1.component.ts` | 삭제 대상 |
| `test/sftp-v1.test.ts` | 삭제 대상 |
| `adapter/index.ts` `export * from './sftp.v1.component'` | 삭제 대상 |
| `common/custom-resources/README.md` 트리 한 줄 | 같이 지움 |

`infra/**` 에 매치 있으면 **중단**. 스택이 v1을 다시 물면 `pulumi up`이 라이브를 만든다.

`PrivateKeyV1Component` / `atmozSftp` digest는 v1 전용이 아님. 지우지 않음.

- `PrivateKeyV1`: `infra/k8s-workstation-system` Argo git-ops
- `containerImages.atmozSftp`: `SftpV3Component`가 digest 핀 사용. v1만 floating `atmoz/sftp:alpine`

### 2. 삭제

| 동작 | 경로 |
|---|---|
| 파일 삭제 | `common/custom-resources/src/components/adapter/sftp.v1.component.ts` |
| 파일 삭제 | `common/custom-resources/test/sftp-v1.test.ts` |
| export 한 줄 삭제 | `common/custom-resources/src/components/adapter/index.ts` — `export * from './sftp.v1.component'` |
| 트리 한 줄 삭제 | `common/custom-resources/README.md` — `sftp.v1.component.ts` |

`index.ts` 에 v3 export만 남긴다.

### 3. 문서 (같은 턴, 역사는 유지)

| 파일 | 동작 |
|---|---|
| 이 이슈 | 상태·게이트·계획. 타임라인 append만 |
| `docs/schedule.md` | 날짜를 2026-10-21로. 닫히면 행 삭제 |
| `docs/resolved/2026-09-09-sftp-adapter-v3.md` | 본문 역사 유지. 닫을 때 후속 한 줄만 “오늘 삭제”로 고침 |
| `docs/resolved/2026-09-08-jest-unit-test-setup.md` | 당시 목록. 수정 없음 |
| `docs/resolved/2026-10-17-version-pin-ssot.md` | 닫을 때 “SftpV1 `atmoz/sftp:alpine`” 문구만 v3 digest 핀으로 정정 |

### 4. 검증

```bash
pnpm --filter @common/custom-resources test
rg -n "SftpV1Component" --glob '!docs/**' --glob '!**/node_modules/**'
```

기대: 테스트 통과. `SftpV1Component` 코드 매치 0.

스택 preview/up 하지 않음. 호출자 0이면 state diff 없음.

### 5. 닫기

사용자 확인 후:

1. 메타 **해결**, **해결일** 2026-10-21
2. `docs/issues/` → `docs/resolved/` (파일명 유지)
3. `docs/schedule.md` 해당 행 삭제
4. v3 resolved 후속 불릿을 해결로 표시

## 수용 기준

- [x] 라이브 호출자가 v3만 쓰는지 재확인 (2026-10-21 MCP)
- [x] qBit·Jellyfin sidecar Running, VSO host/user Synced
- [x] 사용자: v3 무사고 (RaiDrive 포함)
- [x] `sftp.v1.component.ts` / `sftp-v1.test.ts` / v1 export 삭제
- [x] `rg SftpV1Component` 코드 호출자 0
- [x] `@common/custom-resources` 테스트 통과 (10 suite / 27 test)
- [x] `pulumi up` 없음. bootstrap Job 재실행 없음

## 범위 밖

- v3 설계 변경, 호스트키 회전, CA 마운트 제거
- bootstrap Job 재실행 (호스트키 TOFU)
- `PrivateKeyV1Component` 삭제 (Argo가 사용)
- `containerImages.atmozSftp` 변경
- 인프라 스택 preview/up

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-10 | 등록. v3 라이브 유지, v1 삭제는 2026-10-31 이후로 보류 |
| 2026-10-21 | 사용자: v3 무사고, 오늘 진행. 라이브 게이트 통과. 착수일 2026-10-21로 당김. 삭제 계획 작성 |
| 2026-10-21 | v1 컴포넌트·테스트·export·README 줄 삭제. `pnpm --filter @common/custom-resources test` 10/27 통과. `pulumi up` 없음 |
| 2026-10-21 | 사용자 확인. 해결. `docs/resolved`로 이동 |
