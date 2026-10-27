# Vault external group alias가 OIDC·Coder JWT 사이에서 서로 지워짐

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-10-21 |
| **영역** | Vault identity (`k8s-workstation-system` 스택), OIDC 마운트·Coder JWT 마운트 |
| **관련 코드** | `infra/k8s-workstation-system/src/components/vault/vault.identity-tiers.component.ts`, `common/custom-resources/src/components/vault/secret.v1.component.ts` |
| **상태** | **해결** — 티어별 external group 분리 + internal 정책 그룹, 옛 그룹 정책 정리 |
| **해결일** | 2026-10-22 |

## 증상

K8s 1.35.9 업그레이드 뒤 `pulumi preview --refresh`에서 `vaultIdentityTiers-system-{user,manager}-oidcAlias` 2개가 `create`로 나왔다. refresh가 Vault에서 해당 alias를 찾지 못했다.

`pulumi up`으로 만들고 바로 refresh preview를 다시 돌리면 이번엔 `coderJwtAlias` 2개가 `create`로 나왔다. 둘이 번갈아 사라졌다.

## 원인

Vault 문서: "External groups can have one (and only one) alias." ([Identity concepts](https://developer.hashicorp.com/vault/docs/concepts/identity#external-vs-internal-groups))

`VaultIdentityTiersComponent`는 같은 external group(`System User`, `System Manager`)에 OIDC alias와 Coder JWT alias를 함께 붙였다. 나중에 만든 alias가 앞의 것을 대체한다. 생성 순서가 OIDC → JWT라 평소에는 JWT만 남아 있었고, Authentik으로 Vault에 OIDC 로그인하면 그룹 정책이 붙지 않았다.

## 조치

| 일시 | 조치 | 결과 |
|---|---|---|
| 2026-10-21 | `pulumi up --refresh` | OIDC alias 생성, 그 결과 JWT alias가 사라짐 (Coder 워크스페이스 JWT가 그룹 정책을 잃음) |
| 2026-10-21 | `pulumi up --refresh` 재실행 | JWT alias 복구 (OIDC alias 다시 사라짐, up 전 상태로 되돌림) |
| 2026-10-21 | 코드 수정 후 system `up`, tools·apps는 sftp `issuerGroupPolicies`만 `--target` up | 아래 "현재 구조". refresh preview `268 unchanged` |

### 현재 구조

티어마다 그룹 3개:

| 그룹 | type | alias | 정책 |
|---|---|---|---|
| `System Manager` (기존, URN 유지) | external | OIDC 마운트 | (아래 "남은 일") |
| `System Manager (Coder JWT)` | external | Coder JWT 마운트 | 없음 |
| `System Manager (Policies)` | internal | 없음, `memberGroupIds`로 위 두 그룹 | `vault-oidc-kv`, jellyfin·qbittorrent sftp kv-read |

`System User`도 같은 구조이고 정책은 없다. contract 출력 `identityGroupIds`는 internal 정책 그룹 id를 가리킨다. 소비처(SftpV3 `issuerGroupPolicies`, `oidcKvPolicies`) 코드는 바꾸지 않았다.

Alias 생성 순서: JWT alias를 먼저 새 그룹으로 옮긴 뒤 OIDC alias를 만든다. 반대 순서면 OIDC alias 생성이 아직 같은 그룹에 붙은 JWT alias를 지운다.

## 남은 일

- [x] Authentik으로 Vault UI·CLI OIDC 로그인 → 토큰의 `identity_policies`에 `vault-oidc-kv` 등이 있는지 확인 — 2026-10-21 사용자 로그인 정상 확인 (`identity_policies` 직접 조회는 안 함)
- [x] Coder 워크스페이스에서 JWT 로그인 → 같은 정책 확인 — 2026-10-22 `identity_policies`에 `vault-oidc-kv`, jellyfin·qbittorrent sftp kv-read 확인 (`read-policy-price-quest-api-dev`도 있음: `SecretV1Component` developer group 경유로 추정)
- [x] 기존 external group `System Manager`에 옛 정책 3개가 남아 있다 (`GroupPolicies` `exclusive=false`의 `groupId` 변경은 옛 그룹에서 정책을 빼지 않았다). 상속과 중복이라 권한은 같지만, 나중에 정책을 빼면 옛 그룹에 남는다. 위 확인이 끝나면 Vault에서 직접 비운다 — 2026-10-22 Vault API로 `policies=[]` 적용 (type·alias·부모 그룹 유지 확인)
- [ ] tools 스택에 무관한 변경이 대기 중: vikunja Helm release `version 2.4.0 => 2.5.0`, sftp keys-bootstrap Job 재생성(TTL 삭제), Cloudflare `ZeroTrustDeviceDefaultProfile`. apps 스택: jellyfin sftp keys-bootstrap Job. 이번 수정에서는 적용하지 않음. 2026-10-21 사용자 결정: 당분간 무시

## 범위 밖

- `SecretV1Component`(non-prod 전용)의 developer group도 같은 구조(OIDC·JWT alias를 한 external group에)다. prod에는 생성되지 않는다. non-prod를 쓰게 되면 같은 방식으로 고친다 (후속 이슈)

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-10-21 | 등록. K8s Phase 1 후 preview에서 OIDC alias 누락 발견. up으로 OIDC 복구 → JWT 누락, 재 up으로 JWT 복구. Vault 문서로 external group alias 1개 제약 확인 |
| 2026-10-21 | 티어별 OIDC·Coder JWT external group 분리, internal `(Policies)` 그룹으로 정책 상속. system up(+6 ~6), tools·apps sftp `issuerGroupPolicies` targeted up. refresh preview 무변경, 상태 export로 alias·정책·member 확인 |
| 2026-10-21 | 사용자가 Authentik OIDC로 Vault 로그인 정상 확인. 남은 확인은 Coder 워크스페이스 JWT 로그인. tools·apps 무관 변경(차트 등)은 당분간 무시 |
| 2026-10-22 | Coder 워크스페이스 JWT 로그인 `vault token lookup`으로 `identity_policies` 확인. internal `(Policies)` 그룹 상속 정상. 남은 일은 옛 external group `System Manager` 정책 정리 |
| 2026-10-22 | 옛 external group `System Manager`(OIDC alias) 정책 3개를 Vault API로 비움. `(Policies)` 그룹 정책 3개·member 2개 유지 확인. `externalPolicies: true`라 Pulumi drift 없음 |
| 2026-10-22 | 해결. 정리 후 Coder 워크스페이스에서 `identity_policies` 재확인, 정책 유지. tools·apps 무관 변경은 이 이슈 범위 밖(사용자 결정 유지), `SecretV1Component` developer group은 후속 이슈 대상 |
