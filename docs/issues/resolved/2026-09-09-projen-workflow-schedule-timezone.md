# Projen `CronScheduleOptions`에 GitHub Actions schedule timezone 타입 없음

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-09 |
| **재검토 트리거** | 업스트림 PR 머지·릴리스 (2026-11 초 재검색 일정은 PR 제출로 대체) |
| **영역** | 루트 Projen upgrade 워크플로 · 업스트림 `projen` |
| **관련 코드** | `projenrc/workflows/upgrade.ts` (`modifyUpgradeWorkflow`, `.projenrc.ts`에서 호출) · `.github/workflows/upgrade-develop.yml` |
| **업스트림** | [projen/projen#5020](https://github.com/projen/projen/pull/5020) `feat(github): support timezone in workflow schedule triggers` |
| **상태** | **해결** |
| **해결일** | 2026-10-29 |

## 해결 요약

업스트림 PR [projen/projen#5020](https://github.com/projen/projen/pull/5020)으로 `CronScheduleOptions.timezone`을 추가했고, projen `0.104.18`에 릴리스됐다. 이 레포는 주간 deps upgrade로 `0.104.19`가 반영된 뒤 `projenrc/workflows/upgrade.ts`의 `as any`를 제거했고, `upgrade-develop.yml` schedule의 `timezone: Asia/Seoul` 렌더링이 유지되는 것을 확인했다. `UpgradeDependenciesSchedule` timezone 후속 PR은 진행하지 않는다 (필요해지면 새 이슈).

## 배경

GitHub Actions는 2026-03-19부터 `on.schedule`에 IANA `timezone`을 지원한다. 이 레포 upgrade 워크플로는 서울 벽시계(매주 월요일 01:00, `Asia/Seoul`)로 돌리려고 한다.

Projen 워크플로 모델은 이 필드를 아직 타입에 넣지 않았다. `projenrc/workflows/upgrade.ts`에서 `as any`로 우회 중.

## 문제

`github.workflows.CronScheduleOptions`가 `cron: string`만 노출한다. `timezone`을 넣으면 타입 에러라 `as any`가 필요함.

런타임(synth)은 extra field를 YAML로 통과시킨다. 기능은 이미 동작한다. 구멍은 타입·공식 API뿐.

대조 시점 (2026-09-09):

- GitHub: [Changelog](https://github.blog/changelog/2026-03-19-github-actions-late-march-2026-updates/), [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- Projen npm latest `0.103.20` (이 레포와 동일). `main`의 `src/github/workflows-model.ts`도 `cron`만
- `Triggers.schedule` 주석도 아직 “specific UTC times”
- 업스트림 이슈/PR에서 timezone 검색 결과 0건. 거절 기록 없음. 스키마를 손으로 미러하는 구조라 요청이 없으면 안 붙음

재대조 (2026-10-28):

- 이 레포 projen `0.104.14` (자동 upgrade로 올라감), npm latest `0.104.17`. 설치본 `CronScheduleOptions`는 여전히 `cron`만, `Triggers.schedule` 주석도 “specific UTC times” 그대로
- 업스트림 이슈/PR 검색(`timezone`, `CronScheduleOptions`) 여전히 0건

## 현재 조치

`projenrc/workflows/upgrade.ts`의 `modifyUpgradeWorkflow`에서 schedule을 덮어쓸 때 `cron: CronTime.everyWeekAt(1, 1)` + `timezone: Timezone['Asia/Seoul']` + `as any`. 생성 YAML:

```yaml
on:
  schedule:
    - cron: 0 1 * * 1
      timezone: Asia/Seoul
```

기능 우회는 유지. 업스트림 타입이 릴리스되기 전까지 이 레포 코드는 건드리지 않는다.

## 목표

1. 2026-11 초에 업스트림을 다시 검색한다 (이슈·PR·`CronScheduleOptions`).
2. 누가 이미 올렸으면 그 티켓을 추적하고, 타입이 머지되면 `as any`를 제거한다.
3. 그때까지도 언급이 없으면 **직접 업스트림 이슈를 등록**한다. (PR까지는 그때 판단)

2026-10-28 변경: 11월까지 기다리지 않고 이슈 대신 **업스트림 PR을 직접 제출**했다 ([#5020](https://github.com/projen/projen/pull/5020)). 남은 목표는 PR 머지·릴리스 추적 → `as any` 제거.

## 업스트림 PR (#5020)

- 브랜치: fork `ApexCaptain/projen` `feat/github-schedule-timezone` (로컬 작업 트리 `/tmp/projen-timezone-pr/projen`, 휘발성. fork 브랜치가 원본)
- 변경: `src/github/workflows-model.ts` `CronScheduleOptions.timezone?: string` + `Triggers.schedule` 문서, `test/github/workflows.test.ts` 테스트 1개, `docs/api/github.workflows.md` (docgen)
- 검증: jsii compile, test tsc, `workflows.test.ts` 48/48, eslint
- 주의: 레포가 `/tmp` 아래면 projen 테스트가 cwd를 출력 경로로 쓰고 삭제한다 (`src/project.ts` `determineOutdir`). 테스트는 `TMPDIR`을 `/tmp` 밖으로 두고 돌린다
- PR 본문에 Apache 2.0 기여자 문구 필수 (`Require Contributor Statement` 체크). PR 생성·본문 수정은 fine-grained PAT로 불가 → 웹에서
- 체크 현황 (2026-10-28): `Validate PR title`·`Require Contributor Statement` 통과 (첫 실행은 문구 누락으로 실패 → 본문 수정 후 통과). build/test 워크플로는 아직 안 붙음 — 첫 기여자라 메인테이너 실행 승인 대기로 추정

## 수용 기준

- [x] projen 이슈/PR/`CronScheduleOptions` 재검색 (2026-10-28, 0건)
- [x] 업스트림 티켓 링크·추적 — 직접 PR [#5020](https://github.com/projen/projen/pull/5020) 제출 (이슈 등록 대체, 작성자: 사용자)
- [x] #5020 머지 및 해당 변경이 포함된 projen 릴리스 (2026-10-28 머지, `0.104.18`)
- [x] 타입 지원이 배포되면 `projenrc/workflows/upgrade.ts`의 `as any` 제거 — 제거, synth 후 `upgrade-develop.yml` schedule `timezone: Asia/Seoul` 렌더링 유지 확인

## 범위 밖

- 릴리스 전 `as any` 제거, 이 이슈를 이유로 한 수동 Projen 버전 업(주간 자동 upgrade는 별개).
- GitHub Actions timezone 기능 자체 (이미 공식 지원, YAML에 반영됨).
- 후속 업스트림 PR 후보 — `UpgradeDependenciesSchedule`(`src/javascript/upgrade-dependencies.ts`)는 `cron: string[]`만 갖고 `{ cron }`으로만 렌더한다. #5020만으로는 `as any`만 빠지고 `modifyUpgradeWorkflow`의 `.on({ schedule })` 덮어쓰기는 남는다. `expressions(cron, { timezone })` 같은 옵션이 생기면 `depsUpgradeOptions`로 직접 설정 가능. #5020 머지·메인테이너 반응을 본 뒤 별도 이슈로 판단

## 체크리스트 (재개 시)

- [x] #5020 상태 확인 (`gh pr view 5020 --repo projen/projen`). 리뷰 코멘트 있으면 fork 브랜치에서 대응
- [x] 머지됐으면 포함된 릴리스 버전 확인 → 주간 upgrade로 이 레포에 들어왔는지 (`node_modules/projen/lib/github/workflows-model.d.ts`의 `CronScheduleOptions`)
- [x] 타입이 생기면 `as any` 제거 후 `pnpm exec projen`으로 YAML 유지 확인
- [x] #5020 머지 후 `UpgradeDependenciesSchedule` timezone 후속 PR 여부 결정 — 진행 안 함 (2026-10-29)

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-09 | 등록. GitHub timezone은 2026-03-19부터 지원, Projen 타입은 미반영·업스트림 언급 0건. 2026-10 초까지 관찰 후 직접 이슈 등록 여부 결정 |
| 2026-10-06 | 재검토 **2026-10 초 → 2026-11 초** 연기 (`docs/schedule.md` 동기화) |
| 2026-10-28 | 재대조: projen `0.104.14`(latest `0.104.17`)에도 `timezone` 없음, 업스트림 이슈/PR 0건. 관련 코드 경로를 `projenrc/workflows/upgrade.ts`로 정정 |
| 2026-10-28 | 방향 변경: 이슈 대신 업스트림 PR [projen/projen#5020](https://github.com/projen/projen/pull/5020) 제출. 상태 **보류 → 진행중**, 재검토는 11월 초 날짜 → PR 머지·릴리스 트리거 (`docs/schedule.md` 동기화) |
| 2026-10-28 | PR 본문에 기여자 문구 추가 → `Require Contributor Statement` 통과. build/test는 메인테이너 승인 대기. `UpgradeDependenciesSchedule` timezone을 후속 PR 후보로 기록 |
| 2026-10-29 | #5020 2026-10-28 머지(메인테이너 승인) → projen `0.104.18` 릴리스 포함. 주간 deps upgrade로 이 레포 `0.104.19` 반영. `as any`·관련 주석 제거, synth(`ts-node .projenrc.ts`) 후 `upgrade-develop.yml`의 `timezone: Asia/Seoul` 그대로 렌더링 확인. 상태 **진행중 → 적용** |
| 2026-10-29 | 해결. `UpgradeDependenciesSchedule` 후속 PR은 진행 안 함. `docs/issues/resolved` 이동, `docs/schedule.md` 행 삭제 |
