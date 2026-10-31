# Vault 내부 CA 회전 시 신뢰 사본이 갱신되지 않아 Ingress·VSO·sftp가 깨짐

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-25 |
| **영역** | Vault 내부 CA (cert-manager), istio-ingressgateway TLS origination, VSO, sftp adapter (`k8s-workstation-system` / `-tools` / `-apps`) |
| **관련 코드** | `infra/k8s-workstation-system/src/components/vault/vault.helm-chart.component.ts` (CA Certificate), `.../vault/vault.service-mesh.component.ts`, `.../vault-secrets-operator/vault-secrets-operator.resources.component.ts`, `common/custom-resources/src/components/adapter/sftp.v3.component.ts` |
| **상태** | **진행중** — A(CA 장수명 + 키 고정) 적용 완료. CA revision 4, 만료 2036-10-22, 다음 CA 갱신 2033-06-23. 남은 것: 2027-01 말 방법론 재검토 |
| **재검토** | **2027-01 말** — 방법론 재검토 (사용자 요청) |

## 증상 (2026-10-25 19:03 KST)

CA·leaf가 동시에 revision 3으로 갱신된 직후:

- `https://vault.ayteneve93.com` **503** — ingress → Vault TLS origination 검증 실패
- VaultStaticSecret 8개 `x509: certificate signed by unknown authority` (`crypto/rsa: verification error` on `vault-internal-ca`)
- Pulumi Vault provider가 ingress 경유라 `pulumi preview` 실패 → IaC로 복구 불가 (닭과 달걀)
- `VaultConnection` / `VaultAuth`는 계속 `valid=true` → 상태만으로는 감지 안 됨

경과·조치 상세는 [Vault TLS cert reload](2026-09-06-vault-tls-cert-reload.md) 타임라인.

## 원인

| # | 원인 | 근거 |
|---|---|---|
| 1 | **CA가 짧게 살고 매번 새 키로 바뀐다** | CA `Certificate`에 `duration`·`renewBefore`·`privateKey` 미지정 → 기본 90일, 만료 30일 전 갱신 = **60일마다 회전**. cert-manager 1.18부터 `rotationPolicy` 기본값이 `Never` → `Always` (클러스터 v1.21.2) → 갱신마다 새 키 = 새 신뢰 앵커 |
| 2 | **신뢰 배포가 배포 시점 정적 사본** | 4곳이 `Secret.get()`으로 읽어 새 Secret에 복사. `pulumi up` 때만 갱신. 원본(`vault/vault-ca-secret`)이 바뀌어도 사본은 그대로 |
| 3 | **CA와 leaf가 같은 순간 회전** | 둘 다 같은 날 생성·같은 기본 수명 → 같은 시각 갱신. 새 leaf가 즉시 새 CA로 서명돼 옛 CA 사본과 겹치는 기간이 0 |
| 4 | VSO 클라이언트 캐시 (부차) | 사본을 고쳐도 VaultAuth별 캐시 클라이언트가 옛 CA를 들고 있다가 재생성 시 회복 (관측: 패치 후 2~55분) |

### CA 사용처

| 위치 | 방식 | 스택 | 반영 시점 | 10-25 상태 |
|---|---|---|---|---|
| `vault/vault-ca-secret` | 원본 (cert-manager) | system | 즉시 | 정상 |
| Vault raft 백업 Job (`vault` ns) | 원본 직접 마운트 | system | 다음 Job 실행 | 정상 |
| `istio-system/vault-tls-origination-ca` | 정적 사본 → DestinationRule `credentialName` (SDS) | system | `pulumi up` | **옛 CA → 503**. 패치 후 즉시 회복 |
| `vault-secrets-operator/vault-ca-secret` | 정적 사본 → `VaultConnection.caCertSecretRef` | system | `pulumi up` + VSO 클라이언트 재생성 | **옛 CA → VSS 8개 실패**. 패치 후 순차 회복 |
| `jellyfin/jellyfin-sftp-adapter-vault-ca` | 정적 사본 → sftp CronJob 볼륨 | apps | `pulumi up` (apps) | **옛 CA** → 10-25 수동 패치 |
| `qbittorrent/qbittorrent-sftp-adapter-vault-ca` | 정적 사본 → sftp CronJob 볼륨 | tools | `pulumi up` (tools) | **옛 CA** → 10-25 수동 패치 |

## 접근 비교

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| **A. CA 장수명 + 키 고정 (추천)** | CA `Certificate`에 `duration` 10년급, `privateKey.rotationPolicy: Never` | 변경 1곳. CA가 사실상 안 바뀜 → 사본 문제 자체가 사라짐. `Never`면 재발급도 같은 키 → 사본의 옛 CA 인증서로도 새 leaf 검증 가능(사본 인증서 만료 전까지). leaf는 지금처럼 90일 회전 + Reloader | 내부 CA 키 장기 고정 (단일 사용자 홈랩, 클러스터 내부 전용이라 수용 가능). spec 변경 시 CA 1회 즉시 재발급 → 그 직후 3개 스택 `pulumi up`으로 사본 갱신 필요 |
| B. trust-manager `Bundle` | 원본 CA를 대상 ns로 라이브 동기화 | 회전 자동 전파. 표준 도구 | 컴포넌트 추가. Secret 대상은 기동 옵션·RBAC 별도. 새 CA만 담으면 회전 순간 겹침 0 문제는 남음(옛·새 CA 병행 구성 필요). VSO 캐시는 Reloader 등으로 별도 처리 |
| C. reflector/replicator 미러 | annotation으로 Secret 복제 | 단순 | 서드파티. B와 같은 겹침 0·캐시 문제 |
| D. 사용처가 원본 직접 참조 | — | — | 불가. VSO는 같은 ns Secret만, Istio `credentialName`은 gateway ns, Pod 볼륨은 ns 경계 |

## 방법론 상세 (2026-10-25 논의)

"CA가 바뀌면 모든 사용처가 자동으로 새 CA를 읽게" 하려면 세 겹을 풀어야 한다.

| 층 | 문제 | 해법 | 난이도 |
|---|---|---|---|
| ① 배포 | 사본이 `pulumi up` 때만 갱신 (정적 복사) | trust-manager `Bundle` 또는 reflector로 원본 → 대상 ns 라이브 동기화 | 중 |
| ② 재로딩 | 사용처가 바뀐 사본을 다시 읽어야 함 | 아래 표. 대부분 자동, VSO만 Reloader 필요 | 하 |
| ③ 전환 공백 | CA·leaf가 같은 순간 회전 → ①②가 자동이어도 배포·재시작 동안(수 초~수 분) 끊김 | 전환 기간 옛·새 CA를 함께 신뢰하도록 번들 + CA를 leaf보다 먼저 회전(`renewBefore` 분리) | 상 |

②의 사용처별 재로딩:

| 사용처 | 사본 갱신 후 동작 |
|---|---|
| istio-ingressgateway | SDS로 즉시 반영 (2026-10-25 패치 직후 200 확인) |
| sftp CronJob | 실행마다 새 Pod → 자동 |
| VSO | 클라이언트 캐시로 지연 (관측 2~55분). Reloader annotation으로 재시작 자동화 가능 |
| Vault | 이미 Reloader로 처리 |

### ①+② (자동 배포 + 자동 재시작)

trust-manager 설치(Secret 대상 쓰기 옵션·RBAC, trust 네임스페이스를 `vault`로), `Bundle` 대상 4 ns 라벨, 기존 Pulumi 사본 4개 제거·이름 변경 + 참조(DestinationRule `credentialName`, `VaultConnection.caCertSecretRef`, sftp 볼륨) 교체, VSO Reloader. **③이 없어 60일마다 짧은 끊김은 남는다.**

### ①+②+③ (옛·새 CA 병행 배포까지)

| # | 작업 | 위치 |
|---|---|---|
| 1 | trust-manager Helm 컴포넌트 (Secret 대상 옵션·RBAC·trust ns) | system |
| 2 | `Bundle` + 대상 ns 라벨 | system |
| 3 | Pulumi 사본 4개 제거, 이름 변경, 참조 교체 (반영 순서 조정) | system, `common/custom-resources`(sftp) → tools·apps |
| 4 | VSO Reloader annotation | system |
| 5 | CA `renewBefore`를 leaf보다 앞당겨 회전 시점 분리 | system |
| 6 | **옛 CA 보관·제거 장치** — CA 변경 시 옛 인증서를 별도 Secret으로 옮겨 번들에 포함, 옛 leaf 소멸 후 제거. 기성 도구 없음, **직접 구현** (CronJob 또는 소형 컨트롤러 + RBAC) | system (신규) |
| 7 | 감지 알림 (선택) | system |
| 8 | 회전 리허설 — 스테이징 없음, 운영에서 강제 갱신 | 운영 |

규모: 3개 스택 + 공통 패키지, 10개 안팎 파일, 신규 컴포넌트 1~2개(직접 구현 포함), 작업 2~3 세션. 이후 60일마다 회전 감시.

### A와의 관계

A의 `rotationPolicy: Never`는 재발급해도 **같은 키**를 쓴다. 옛 CA 인증서 사본으로도 새 leaf 서명을 검증할 수 있어(같은 키·같은 subject), ③의 "옛·새 병행" 효과를 별도 장치 없이 얻는다. 지켜야 할 것은 사본 쪽 CA 인증서의 만료일뿐.

### 결정 (2026-10-25)

- **A 채택** (사용자). ①+②+③은 CA를 정기 회전해야 할 요구가 생길 때 별도 설계
- 이슈는 열어 두고 **2027-01 말** 재검토: A 적용 결과, 정기 회전 필요성, ①②(특히 VSO Reloader)만이라도 넣을지

## 추천

**A를 먼저 적용.** 원인 1·3을 없애 원인 2·4가 드러날 일이 거의 없어진다. B는 CA를 정기 회전해야 할 이유가 생기면 그때 검토.

적용 순서 (한 번의 계획 작업):

1. CA `Certificate`에 `privateKey.rotationPolicy: Never` + `duration`(예: 87600h) 설정 → system `pulumi up` → CA 재발급(키 유지 여부 확인)
2. system 스택 `pulumi up` 재실행 또는 같은 실행에서 istio·VSO 사본 갱신 확인
3. tools·apps 스택 `pulumi up` → sftp 사본 2개 갱신
4. `vault.ayteneve93.com` 200, VSS 8/8, sftp CronJob 수동 1회 실행 성공 확인

부가 (선택):

- 감지 보강: 외부 `vault.ayteneve93.com/v1/sys/health`와 VSS Unhealthy를 Grafana 알림에 추가 (`VaultConnection` valid로는 못 잡음)
- 사본 생성 코드 공통화: 같은 `Secret.get` + 복사 패턴이 3곳 → 헬퍼로 묶기

## 수용 기준

- [x] jellyfin·qbittorrent sftp 사본 2개 새 CA로 갱신 (2026-10-25 수동 패치. tools·apps `pulumi up` 정합성 확인은 A 적용 때)
- [x] CA `Certificate`에 `rotationPolicy: Never`·`duration: 87600h` 반영 (2026-10-25 system `pulumi up`, update 624)
- [x] 재발급 후 키 동일 여부 기록 (2026-10-25 강제 갱신 revision 4, 공개키 지문·SKI 동일)
- [x] 사본 4곳을 10년짜리 CA로 갱신 (2026-10-25 패치 + 3개 스택 `pulumi refresh`, Secret 차이 없음)
- [x] 사본 4곳 serial이 원본과 일치 (`4A3C4794…`)
- [x] 외부 Vault 200, VSS 8/8 Healthy, sftp Job 성공 (2026-10-25 bootstrap Job 2개가 새 CA 사본으로 Vault 로그인·KV 읽기 성공)
- [ ] (선택) 외부 Vault health·VSS Unhealthy 알림
- [x] **2026-12-24 10:03Z** 전에 완료 (CA 다음 갱신 2033-06-23)

## 범위 밖

- Vault leaf 회전·Reloader ([Vault TLS cert reload](2026-09-06-vault-tls-cert-reload.md))
- trust-manager 도입 (A로 부족할 때 별도 이슈)

## 관련 링크

- https://cert-manager.io/docs/releases/release-notes/release-notes-1.18/ (`rotationPolicy` 기본값 변경)
- https://www.buoyant.io/blog/careful-with-cert-manager-1-18 (CA 회전 시 신뢰 번들 주의)
- https://cert-manager.io/docs/trust/trust-manager

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-25 | 등록. 19:03 CA·leaf 동시 회전으로 ingress 503·VSS 8개 실패. istio·VSO 사본 수동 패치로 복구, system preview 268 unchanged. sftp 사본 2개 미조치(2026-10-26 03:00 KST sftp reconcile CronJob 영향 예상). 원인 4개·사용처 표·추천안 A 정리 |
| 2026-10-25 | 사용자 승인으로 sftp 사본 2개(`jellyfin-sftp-adapter-vault-ca`, `qbittorrent-sftp-adapter-vault-ca`) `ca.crt`를 새 CA `5B5E61AB…`로 패치. 사본 4곳 모두 원본과 일치. 10-26 03:00 sftp reconcile CronJob 결과 확인 필요 |
| 2026-10-25 | A 코드 반영: CA `duration: 87600h`, `privateKey.rotationPolicy: Never` (`vault.helm-chart.component.ts`), `CertificateV1` 타입에 `privateKey` 추가. 첫 preview(refresh 없음)는 수동 패치한 사본 2개를 replace로 잡음(stale state, `already exists`로 실패할 경로) → `pulumi refresh` 후 `pulumi up`: Certificate 1 updated, 267 unchanged |
| 2026-10-25 | **즉시 재발급 없음** — revision 3 유지 (`5B5E61AB…`, 만료 2027-01-23, 갱신 2026-12-24). `duration`·`rotationPolicy` 변경만으로는 재발급이 안 됨 (Vault TLS 이슈의 "spec 변경 시 즉시 재발급" 서술은 이 두 필드엔 해당 없음). 12-24 갱신 시 같은 키·10년 CA → 사본은 계속 검증 가능하나 사본 CA 인증서는 01-23 만료라 그 전 갱신 필요. 외부 Vault 200, VSS 8/8 |
| 2026-10-25 | 강제 갱신(status `Issuing` 조건, cmctl renew 동등): CA revision 4, serial `4A3C4794…`, 만료 2036-10-22, 다음 갱신 2033-06-23. 공개키 지문 `6cafcb87…`·SKI `11:DC:F4:…` 동일(키 유지). leaf(rev 3)는 옛 사본·새 CA 모두로 검증 OK |
| 2026-10-25 | 3개 스택 preview에서 사본 Secret이 **replace**로 나옴 (provider 기본: Secret 데이터 변경 = 교체) + 무관 변경(tools·apps `keysBootstrapJob` 생성, tools Cloudflare `ZeroTrustDeviceDefaultProfile`, system authentik Group users unknown) → `up` 대신 사본 4곳을 새 CA로 패치 + 3개 스택 `pulumi refresh`. 재 preview: system 268 unchanged, tools·apps는 무관 변경만. 외부 Vault 200, VSS 8/8 |
| 2026-10-25 | tools·apps 배포 때 sftp bootstrap Job 2개가 새 CA 사본으로 Vault TLS·로그인·KV 읽기 성공. 전체 점검: 노드 Ready, 비정상 Pod 0, 최근 1시간 재시작 0, Warning 이벤트 0, Certificate 5/5, VSO 13/13, Vault unsealed, Longhorn 19 healthy, CNPG 3 healthy, 외부 엔드포인트 10개 정상 응답 |
| 2026-10-26 04:01 | 새 10년 CA 사본으로 첫 정기 sftp reconcile CronJob(03:00 KST) jellyfin·qbittorrent 둘 다 성공, x509·unknown authority 오류 없음. 전체 점검 이상 없음 (Certificate 5/5, VSO 13/13, Vault unsealed, 외부 엔드포인트 10/10) |
