# sftp adapter 부트스트랩 Job 재생성 시 SSH 키가 덮어써짐

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-25 |
| **영역** | sftp adapter v3 (jellyfin `k8s-workstation-apps`, qbittorrent `k8s-workstation-tools`) |
| **관련 코드** | `common/custom-resources/templates/sftp-v3-issuer-job.sh.tpl`, `common/custom-resources/src/components/adapter/sftp.v3.component.ts`, `common/custom-resources/test/sftp-v3.test.ts` |
| **상태** | **적용** — 2026-10-25 tools·apps 배포 완료. 두 adapter 모두 bootstrap skip·키 보존 확인 |

## 증상

tools·apps preview마다 `keysBootstrapJob` **create**가 남는다 (2026-10-21부터 "무관한 차이"로 보류).

## 원인

- 부트스트랩 Job은 `ttlSecondsAfterFinished: 86400` → 완료 하루 뒤 Kubernetes가 삭제 → refresh 후 Pulumi가 "없음"으로 보고 다음 `up`에서 재생성. `ignoreChanges: ['spec']`는 삭제된 경우를 막지 못한다
- bootstrap 분기가 기존 키 확인 없이 **호스트 키·유저 키를 새로 발급해 KV에 덮어씀**
- 결과: tools·apps에서 어떤 이유로든 `pulumi up`을 하면 SFTP 호스트 키가 바뀌어 클라이언트 TOFU가 깨지고, 유저 키도 교체된다 (Slack 알림·7일 overlap 없이)

## 조치

bootstrap 분기를 멱등으로 변경:

- `kv_get_or_empty` 헬퍼: KV가 있으면 JSON, `No value found`면 빈 값, **그 밖의 오류(403·네트워크 등)는 Job 실패**. 읽기 오류를 "키 없음"으로 오인해 덮어쓰지 않게 구분
- 호스트 KV `private_key`가 있으면 호스트 발급 생략, 유저 KV `current_private`가 있으면 유저 발급 생략 (각각 독립 판단)

검증:

| 시나리오 (stub vault, bash) | 결과 |
|---|---|
| KV 비어 있음 | host·user 발급, KV 2건 기록 |
| 키 있는 상태에서 재실행 | 둘 다 skip, KV 변경 0 |
| KV 읽기 403 | exit 1, KV 변경 0 |
| host만 있음 | host skip, user만 발급 |

`custom-resources` jest 27/27 통과, eslint 통과. 로컬 dash `sh`에선 기존 `echo "$JSON" | jq` 줄이 `\n`을 해석해 깨지므로 하네스는 bash로 실행 (실제 이미지는 alpine busybox `echo`라 해당 없음).

## 배포 시 주의

- tools·apps `pulumi up` 시 예상 변경: `keysBootstrapJob` create(이제 skip만 하고 종료), sftp CronJob 3종 스크립트 update, tools의 Cloudflare `ZeroTrustDeviceDefaultProfile` update(detailedDiff 없는 영구 차이로 추정)
- 작업 트리에 커밋 안 된 `common/utils/src/configs/versions.config.ts` 변경이 있으면 함께 반영되므로 분리 후 실행
- 배포 후 bootstrap Job 로그에 `host key exists … skip` / `user key exists … skip` 확인, Vault KV 호스트 키 변경 없음 확인

## 수용 기준

- [x] bootstrap 멱등 (기존 키 보존, 읽기 오류 시 실패)
- [x] 테스트 (jest 문자열 확인 + stub vault 시나리오 4종)
- [x] apps(jellyfin) `pulumi up` 후 Job 로그 skip, 호스트 키 불변
- [x] tools(qbittorrent) `pulumi up` 후 Job 로그 skip, 호스트 키 불변

## 범위 밖

- Cloudflare `ZeroTrustDeviceDefaultProfile` 영구 차이 (provider 이슈 여부 별도 확인)
- `ttlSecondsAfterFinished` 제거 (멱등화로 불필요. 재생성돼도 안전)

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-25 | 등록. CA 사본 정리 중 tools·apps preview의 `keysBootstrapJob` create 원인 확인 (TTL 삭제 → 재생성 → 비멱등 bootstrap이 키 덮어씀). 스크립트 멱등화·테스트 완료. 배포 전 |
| 2026-10-25 | 사용자 승인으로 tools(update 252: Job create, CronJob 2 update, Cloudflare 프로필 update)·apps(Job create, CronJob 2 update) `pulumi up`. 두 bootstrap Job 로그 `host key exists … skip` / `user key exists … skip`. system은 268 unchanged (versions.config 차트 버전은 사용자가 10-23에 이미 반영, 커밋만 안 된 상태) |
