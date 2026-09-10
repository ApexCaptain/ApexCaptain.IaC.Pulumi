# SftpV1 코드 삭제 — 10월 말까지 v3 관찰 후

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-10 |
| **재검토 예정** | **2026-10-31** 이후 (10월 말까지 v3 라이브 관찰) |
| **영역** | `SftpV1Component` 코드·테스트. 라이브 SFTP는 이미 v3 |
| **관련 코드** | `common/custom-resources/src/components/adapter/sftp.v1.component.ts`, `test/sftp-v1.test.ts`, `adapter/index.ts` |
| **선행** | [SFTP Adapter v3](../resolved/2026-09-09-sftp-adapter-v3.md) (해결) |
| **상태** | **보류** — 10월 말까지 v3 유지·관찰. 그 전에 v1 삭제·v3 교체 없음 |

## 배경

qBit·Jellyfin SFTP는 2026-09-10 기준 `SftpV3Component`다. RaiDrive `current_private` 로그인 확인됨.

`SftpV1Component`는 호출자가 없다. tls `PrivateKey` + ConfigMap 경로. 코드·유닛 테스트만 남음.

바로 지우지 않는다. v3를 한동안 굴려 보고 (분기 rotate 전, 호스트키 TOFU·Reloader·VSO) 문제 없으면 10월 말 이후 삭제한다.

## 현재 상태

- 라이브: tools qBit `sftpAdapter`, apps Jellyfin `jellyfinSftpAdapter`. 둘 다 v3.
- 레포: `SftpV1Component` export + `sftp-v1.test.ts`. 인프라 스택 import 없음.
- v2는 이미 코드·라이브에서 제거됨.

## 목표

2026-10-31 이후:

1. qBit·Jellyfin v3가 그대로 동작하는지 확인 (RaiDrive, VSO Synced, bootstrap Job 재실행 없음).
2. `SftpV1Component` 호출자가 여전히 없는지 확인.
3. 컴포넌트·테스트·`adapter/index.ts` export 삭제. 관련 README 언급이 있으면 정리.

## 수용 기준

- [ ] 2026-10-31 이후 재개. 그 전 삭제 없음
- [ ] 라이브 호출자가 v3만 쓰는지 재확인
- [ ] `sftp.v1.component.ts` / `sftp-v1.test.ts` / v1 export 삭제
- [ ] `@common/custom-resources` 테스트 통과

## 범위 밖

- v3 설계 변경, 호스트키 회전, CA 마운트 제거
- bootstrap Job 재실행 (호스트키 TOFU)
- 10월 말 전에 v1을 “미리” 지우는 것

## 체크리스트 (재개 시)

- [ ] qBit·Jellyfin sidecar Running, VSO host/user Synced
- [ ] 사용자 RaiDrive 로그인 이상 없는지 한 줄 확인
- [ ] `rg SftpV1Component` 호출자 0
- [ ] v1 파일 삭제 후 `pnpm --filter @common/custom-resources test`

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-10 | 등록. v3 라이브 유지, v1 삭제는 2026-10-31 이후로 보류 |
