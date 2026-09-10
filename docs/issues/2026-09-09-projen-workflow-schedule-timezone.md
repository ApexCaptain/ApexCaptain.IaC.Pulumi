# Projen `CronScheduleOptions`에 GitHub Actions schedule timezone 타입 없음

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-09 |
| **재검토 예정** | **2026-10 초** (약 1달) |
| **영역** | 루트 Projen upgrade 워크플로 · 업스트림 `projen` |
| **관련 코드** | `.projenrc.ts` (`modifyUpgradeWorkflow`) · `.github/workflows/upgrade-develop.yml` |
| **업스트림** | [projen/projen](https://github.com/projen/projen) `CronScheduleOptions` |
| **상태** | **보류** — 2026-10 초까지 업스트림 이슈/PR 출현만 관찰. 그때까지 없으면 직접 이슈 등록 |

## 배경

GitHub Actions는 2026-03-19부터 `on.schedule`에 IANA `timezone`을 지원한다. 이 레포 upgrade 워크플로는 서울 벽시계(매주 월요일 01:00, `Asia/Seoul`)로 돌리려고 한다.

Projen 워크플로 모델은 이 필드를 아직 타입에 넣지 않았다. `.projenrc.ts`에서 `as any`로 우회 중.

## 문제

`github.workflows.CronScheduleOptions`가 `cron: string`만 노출한다. `timezone`을 넣으면 타입 에러라 `as any`가 필요함.

런타임(synth)은 extra field를 YAML로 통과시킨다. 기능은 이미 동작한다. 구멍은 타입·공식 API뿐.

대조 시점 (2026-09-09):

- GitHub: [Changelog](https://github.blog/changelog/2026-03-19-github-actions-late-march-2026-updates/), [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- Projen npm latest `0.103.20` (이 레포와 동일). `main`의 `src/github/workflows-model.ts`도 `cron`만
- `Triggers.schedule` 주석도 아직 “specific UTC times”
- 업스트림 이슈/PR에서 timezone 검색 결과 0건. 거절 기록 없음. 스키마를 손으로 미러하는 구조라 요청이 없으면 안 붙음

## 현재 조치

`.projenrc.ts`에서 schedule을 덮어쓸 때 `timezone: Timezone['Asia/Seoul']` + `as any`. 생성 YAML:

```yaml
on:
  schedule:
    - cron: 0 1 * * 1
      timezone: Asia/Seoul
```

기능 우회는 유지. 10월 초 전까지 이 레포 코드는 건드리지 않는다.

## 목표

1. 2026-10 초에 업스트림을 다시 검색한다 (이슈·PR·`CronScheduleOptions`).
2. 누가 이미 올렸으면 그 티켓을 추적하고, 타입이 머지되면 `as any`를 제거한다.
3. 그때까지도 언급이 없으면 **직접 업스트림 이슈를 등록**한다. (PR까지는 그때 판단)

## 수용 기준

- [ ] 2026-10 초에 projen 이슈/PR/`CronScheduleOptions` 재검색
- [ ] 업스트림 티켓이 있으면 링크를 이 문서에 붙이고 추적
- [ ] 없으면 업스트림 이슈 등록 (작성자: 사용자)
- [ ] 타입 지원이 배포되면 `.projenrc.ts`의 `as any` 제거 여부 결정

## 범위 밖

- 지금 `as any` 제거, Projen 버전 업, 이 레포에서 업스트림 PR 작성.
- GitHub Actions timezone 기능 자체 (이미 공식 지원, YAML에 반영됨).

## 체크리스트 (재개 시)

- [ ] npm `projen` latest / 설치된 버전의 `CronScheduleOptions`에 `timezone` 있는지
- [ ] https://github.com/projen/projen 이슈·PR 검색 (`timezone`, `CronScheduleOptions`, schedule)
- [ ] 여전히 없으면 이슈 초안: GitHub changelog(2026-03-19) + 공식 syntax + 타입 한 줄(`timezone?: string`) 요청
- [ ] 타입이 생기면 `as any` 제거 후 `pnpm exec projen`으로 YAML 유지 확인

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-09 | 등록. GitHub timezone은 2026-03-19부터 지원, Projen 타입은 미반영·업스트림 언급 0건. 2026-10 초까지 관찰 후 직접 이슈 등록 여부 결정 |
