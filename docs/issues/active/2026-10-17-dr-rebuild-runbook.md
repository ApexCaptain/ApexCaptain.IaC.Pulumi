# 클러스터 전체 재구축·복원 런북 없음

| 항목 | 내용 |
|------|------|
| **등록일** | 2026-10-17 |
| **우선순위** | 낮음 |
| **영역** | 문서, `ansible/`, Pulumi 스택 순서, pCloud 백업 |
| **관련 문서** | [pCloud PVC 암호화 백업](2026-09-15-pcloud-pvc-encrypted-backup.md) — "각 Postgres dump로 빈 DB 복원 가능" 미체크 |
| **상태** | **보류** — 백업 복원 검증(pCloud 이슈)과 묶어서 진행 |

## 배경

백업(Vault raft, CNPG pg_dump, config tar)은 pCloud로 매일 나간다. 그러나 노드 유실 시 "빈 머신 → 서비스 복구" 순서가 문서로 없다. README는 스택 배포 순서만 있다.

## 문제

장애 시점에 기억에 의존해야 한다. 순환 의존(Vault unseal ↔ OCI KMS, Authentik ↔ Longhorn UI, ESC ↔ kubeconfig)이 있어 순서를 틀리면 막힌다.

## 목표 (런북 목차 초안)

1. 전제: ESC·OCI KMS·pCloud·Cloudflare 접근 확인
2. 노드: Ventoy user-data → `ansible:preConfigure` → `kubespray:cluster` → `ansible:postConfigure`
3. kubeconfig → `script:syncPulumiEsc` 갱신
4. 스택: cloudflare → system(단계별 주의점) → apps/tools
5. 데이터 복원: Vault raft snapshot restore, CNPG `bootstrap.recovery`/import, config tar
6. 검증 체크리스트

## 수용 기준

- [ ] `docs/runbooks/cluster-rebuild.md` (또는 합의된 위치) 작성
- [ ] Vault raft snapshot과 CNPG dump 각각 1회 실복원 검증 (임시 NS 또는 kind)
- [ ] README에서 링크

## 범위 밖

- 자동화된 DR 리허설

## 타임라인

| 일시 | 내용 |
|------|------|
| 2026-10-17 | 등록 |
