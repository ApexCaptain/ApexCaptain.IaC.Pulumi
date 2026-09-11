# GitHub Wiki 관리 방식 — 보류, 나중에 결정

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-09-10 |
| **영역** | 레포 문서 (`docs/`), GitHub Wiki |
| **관련 코드** | `docs/issues/`, `docs/resolved/`, `docs/schedule.md`, `.cursor/rules/use-docs-issues.mdc`, `.cursor/rules/use-docs-schedule.mdc` |
| **상태** | **보류** — 급하지 않음. 일정표 미등록. 시간 될 때 결정 |

## 배경

GitHub Wiki가 뭔지, `docs/`를 그쪽으로 옮기면 일이 커지는지, 에이전트가 읽고 쓸 수 있는지, 다른 팀은 어떻게 관리하는지 정리했다. 당장 옮기거나 CI를 붙이지 않는다.

Wiki는 레포 **1개당 1개**. 조직 공용이 아니다. 메인 레포 안 `wiki/` 폴더가 아니라 GitHub가 붙이는 **숨은 sidecar 원격**이다.

```
github.com/ApexCaptain/ApexCaptain.IaC.Pulumi.git         ← 코드
github.com/ApexCaptain/ApexCaptain.IaC.Pulumi.wiki.git    ← Wiki (조직 Repositories 목록에 안 보임)
```

웹에서 첫 페이지를 만든 뒤에만 `.wiki.git`이 clone 된다. PR 없음. default branch에 push된 것만 공개. 파일 약 5,000개 soft limit.

## 현재 상태

- 이슈 SSOT는 GitHub Issue가 아니라 `docs/issues/` → 해결 시 `docs/resolved/`. 인덱스는 `docs/schedule.md`.
- 에이전트 룰이 이 경로를 전제로 한다. 이슈 갱신과 IaC 변경은 같은 커밋/PR에 탄다.
- 레포 설정 `has_wiki: true`. 페이지는 없음. `.wiki.git` clone은 `Repository not found`.
- Wiki MCP 없음. `gh wiki` 없음. GitHub REST로 위키 페이지 CRUD가 거의 없음.
- 에이전트가 Wiki를 다루려면 `.wiki.git`을 따로 clone한 뒤 별도 커밋/push. 코드 PR과 원자적이지 않음.
- 현재 DevContainer 토큰이 fine-grained PAT(`github_pat_`)다. Wiki git은 classic `repo` 스코프가 필요한 경우가 많아, 페이지가 생겨도 clone/push가 막힐 수 있다.

## 목표

나중에 Wiki 탭이 필요해지면, 저자 위치(SSOT)와 배포 위치(Wiki)를 한 줄로 정한다. 그 전엔 `docs/`를 그대로 둔다.

## 접근 비교

| 방식 | 요지 | 이 레포에 |
|---|---|---|
| **A. 웹만 편집** | GitHub Wiki 탭에서 직접 저장 | 에이전트·PR·경로 룰과 단절. `docs/`와 이중 SSOT |
| **B. 형제 clone** | `foo`와 `foo.wiki`를 로컬에 따로 clone, 커밋 두 번 | GitHub 공식 로컬 편집법. 서브모듈 아님. 사람이 두 원격을 기억해야 함 |
| **C. 서브모듈** | `.wiki.git`을 `docs/` 등에 submodule로 붙임 | 예전에 흔했음. 포인터 커밋, clone 누락, 웹 편집과 어긋남. 2026에도 서브모듈을 떼고 in-repo + CI로 바꾸는 사례가 있음 |
| **D. 레포 안 SSOT + CI 미러** | `docs/` 또는 `wiki/`를 고치고, `main` 머지(또는 태그) 때 Action이 `.wiki.git`에 push. Wiki는 읽기용 | PR·에이전트·원자성 유지. Wiki 웹 편집은 다음 싱크에 덮어씀 |
| **E. Wiki 안 씀** | `docs/`만. Wiki 탭은 비움 | 지금과 동일. 이슈 트래킹 용도와 맞음 |

`docs/`를 Wiki **저자 위치**로 이사하는 것(A/B/C, 파일을 `.wiki.git`에만 두는 것)은 파일 복사(md 10여 개)는 작다. 커지는 건 워크플로: 커밋 분리, 룰 전면 수정, 상대링크·디렉토리(`issues/` / `resolved/`) 의미, 아카이브 `git mv`가 다른 원격으로 감.

## 추천

1. **지금은 E.** `docs/`를 SSOT로 유지. Wiki로 이사하지 않음. 서브모듈 쓰지 않음.
2. Wiki 탭이 정말 필요하면 **D.** `docs/`는 그대로 두고 CI가 Wiki로 미러. 저자는 코드 레포, Wiki는 배포판.
3. D를 해도 이슈 문서를 Wiki에 올릴지는 따로 정한다. `docs/issues`는 운영 기록이지 사용자 매뉴얼이 아니다. 공개 Wiki에 올리면 안 되는 내용이 있는지도 그때 본다.

## 수용 기준

결정만. 구현은 후속.

- [ ] SSOT를 `docs/`로 둘지, Wiki로 둘지, 둘 다(D 미러) 할지 결정
- [ ] Wiki 탭이 필요하면 미러 범위(`docs/` 전체 vs 일부)와 트리거(push to `main` vs 태그) 결정
- [ ] 구현하기로 하면 별도 이슈로 분리 (워크플로, 토큰, 첫 페이지 부트스트랩)

## 범위 밖

- 이번 이슈에서 Wiki 페이지 생성, CI 워크플로 추가, 서브모듈 추가, `docs/` 이동
- GitHub Issue로 이슈 SSOT를 바꾸는 것
- fine-grained PAT로 wiki.git이 되는지는 D를 실제로 붙일 때 검증

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-09-10 | 등록. 추천은 `docs/` 유지, Wiki 필요 시 CI 미러. 일정 없음, 보류 |
