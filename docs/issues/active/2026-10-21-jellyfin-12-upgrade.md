# Jellyfin 12 업그레이드 (차트 3.4.0) — SSO 플러그인 호환 대기

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-21 |
| **영역** | apps 스택 Jellyfin (`jellyfin` 네임스페이스), Authentik SSO |
| **관련 코드** | `common/utils/src/configs/versions.config.ts` (`helmChartVersions.jellyfin`), `infra/k8s-workstation-apps/src/components/jellyfin/jellyfin.helm-chart.component.ts`, `jellyfin.authentik.component.ts` |
| **상태** | **보류** — jellyfin-plugin-sso가 Jellyfin 12 ABI를 지원할 때까지 |

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

## 진행 순서 (트리거 충족 후)

1. SSO 플러그인 manifest에서 12.x `targetAbi` 버전 확인. 나머지 플러그인도 12 호환 확인
2. config PVC 백업 (Longhorn 스냅샷 + Jellyfin 내장 백업)
3. 서드파티 플러그인 제거
4. `helmChartVersions.jellyfin` 3.4.0 (또는 그때 최신) → apps 스택 preview → up
5. 첫 기동 마이그레이션 로그 확인 → 전체 라이브러리 재스캔
6. 플러그인 재설치 (stable repo), SSO 로그인 확인

## 수용 기준

- [ ] SSO 플러그인 12 호환 버전 확인
- [ ] 업그레이드 전 config 백업
- [ ] Jellyfin 12.x 기동, 마이그레이션 오류 없음
- [ ] 라이브러리 재스캔 완료
- [ ] Authentik SSO 로그인, GPU 트랜스코딩, SFTP sidecar 정상

## 범위 밖

- 다른 Helm 차트 업그레이드 (같은 날 별도 진행)
- Jellyfin ambient mesh 복귀 ([별도 이슈](2026-08-17-jellyfin-ambient-mesh-direct-play-seek.md))

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-21 | 등록. Nova 진단 후 차트 업그레이드 사전 점검에서 SSO 플러그인 비호환 확인, 보류 |
