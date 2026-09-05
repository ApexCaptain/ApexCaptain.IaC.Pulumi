# Vault TLS — cert-manager 갱신 후 프로세스가 옛 인증서를 계속 제공

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-09-06 |
| **영역** | Vault / VSO / cert-manager (`k8s-workstation-system`) |
| **관련 코드** | `infra/k8s-workstation-system/src/components/vault/vault.helm-chart.component.ts` |
| **상태** | **적용** — STS·Reloader 반영. Reloader 실검증은 다음 leaf 갱신 때 |

## 배경

내부 CA·서버 인증서는 cert-manager가 갱신한다. Vault는 `tls_cert_file` / `tls_key_file`을 **기동 시 한 번** 읽는다. kubelet은 Secret 마운트를 갱신하지만 프로세스는 그대로다.

## 문제

2026-08-26 cert-manager가 CA·서버 cert를 `revision: 2`로 갱신했다. Vault 프로세스는 2026-08-24 기동 이후 TLS를 다시 읽지 않음.

VSO는 새 CA로 `https://vault.vault.svc.cluster.local:8200`을 검증하다 `x509: certificate signed by unknown authority` / `crypto/rsa: verification error` on `vault-internal-ca`. Price Quest `VaultStaticSecret` sync 실패.

Readiness는 `vault status -tls-skip-verify`라 Vault Pod는 Ready로 보임.

조치: `vault-0`에 SIGTERM. ocikms unseal 자동. 이후 `VaultConnection` Healthy.

## 현재 접근

이미 떠 있는 Stakater Reloader로 서버 TLS Secret 변경 시 STS를 롤한다.

| 선택지 | 요지 |
|--------|------|
| Reloader + `RollingUpdate` | cert Secret 갱신 → vault-0 재시작. replica 1 + ocikms. |
| SIGHUP sidecar | Raft 안 죽이고 cert만 재로드. sidecar·PID 공유 필요. |
| CA lifetime만 늘리기 | leaf 갱신 때 Vault는 여전히 옛 leaf를 낸다. 부족. |

**채택:** Reloader + `server.updateStrategyType: RollingUpdate`. Helm 기본 `OnDelete`면 Reloader annotation 패치가 Pod를 안 굴린다.

STS annotation: `secret.reloader.stakater.com/reload: vault-server-certificate-secret`.

## 다음 확인

cert-manager 기본 90일, `renewBefore` ≈ 만료 30일 전. 현재 revision 2 기준:

| 인증서 | notBefore | renewalTime (UTC) | 만료 notAfter | KST |
|--------|-----------|-------------------|---------------|-----|
| `vault-server-certificate` (leaf) | 2026-08-26 10:03 | **2026-10-25 10:03:36Z** | 2026-11-24 10:03:36Z | 갱신 **2026-10-25 19:03** |
| `vault-ca-certificate` | 2026-08-26 10:03 | 2026-10-25 10:03:34Z | 2026-11-24 10:03:34Z | 같은 날, leaf와 거의 동시 |

**그때 할 일:** Reloader가 `vault-server-certificate-secret` 변경으로 vault-0를 롤했는지, 롤 후 `VaultConnection` Healthy·서비스 DNS TLS가 유지되는지. 통과하면 이슈를 `docs/resolved`로 옮긴다.

CA도 같은 날 돈다. VSO `vault-ca-secret`은 배포 시점 복사라, Reloader가 Vault만 롤해도 VSO가 옛 CA를 들고 있을 수 있다. 그건 범위 밖 후속.

## 수용 기준

- [x] `k8s-workstation-system` prod에 반영
- [x] Vault STS `updateStrategy: RollingUpdate`
- [x] STS에 Reloader annotation 존재
- [ ] **2026-10-25** leaf 갱신: Reloader가 vault-0를 롤하고 VSO TLS가 유지

## 범위 밖

VSO `vault-ca-secret`은 Pulumi `Secret.get()` 배포 시점 복사다. CA와 leaf가 같이 90일이면 CA 회전 후 VSO가 옛 CA를 들고 다시 깨질 수 있다. 후속: CA lifetime 연장, 또는 VSO ns로 CA 라이브 미러. **이번 변경에서 CA duration을 올리지 않는다** — spec 변경이 즉시 CA 재발급을 유발한다.

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-08-24 | Vault 프로세스 기동, TLS 로드 |
| 2026-08-26 | cert-manager CA·서버 cert 갱신 (마운트만 갱신) |
| 2026-09-06 | VSO TLS 실패 확인, vault-0 SIGTERM으로 복구 |
| 2026-09-06 | Reloader + RollingUpdate 코드 반영 |
| 2026-09-06 | prod 배포. STS annotation·RollingUpdate 확인. vault-0 롤(0.34.1 / 2.0.4), unsealed, 서비스 DNS TLS 통과. VSO VaultConnection Healthy |
| 2026-09-06 | 클러스터 재점검 정상. resolved 보류. 다음 leaf 갱신 **2026-10-25 10:03:36Z** (KST 19:03). 그때 Reloader 검증 후 아카이브 |
