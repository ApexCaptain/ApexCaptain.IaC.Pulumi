# Kubespray 실행마다 etcd admin·member·node 인증서 재발급

| 항목 | 내용 |
|---|---|
| **등록일** | 2026-11-06 |
| **영역** | `workstation-0` etcd (Kubespray `etcd_deployment_type: host`), `/etc/ssl/etcd/ssl/` |
| **관련 코드** | `ansible/third_party/kubespray/roles/etcd_defaults/defaults/main.yml` (`force_etcd_cert_refresh`), `ansible/third_party/kubespray/roles/etcd/tasks/check_certs.yml`, `ansible/workstation/inventory/group_vars/` |
| **상태** | **보류** — 원인 확인됨 (Kubespray 기본값). 기본값 유지 / `false` 오버라이드 결정 대기 |

## 배경

[Kubernetes 1.36 업그레이드](../resolved/2026-10-13-kubernetes-1-36-upgrade.md) 중 Kubespray를 세 번 돌렸다. 세 번 모두 `etcd : Gen_certs | run cert generation script ...` 태스크가 changed였고 etcd admin·member 인증서 파일 시각이 실행 시각으로 바뀌었다.

| 실행 | Kubespray | 결과 |
|---|---|---|
| 2026-10-21 Phase 1 (1.35.4 → 1.35.9) | `867694464` | admin·member 재발급 |
| 2026-11-06 재적용 (1.35.9 유지) | `42aebca4d` | 22:17 재발급 |
| 2026-11-06 Phase 2 (1.35.9 → 1.36.5) | `42aebca4d` | 재발급 |

CA(`ca.pem`, 2026-06-17)는 바뀌지 않았고 etcd·apiserver는 정상이었다.

## 원인

`roles/etcd_defaults/defaults/main.yml`의 기본값이 `force_etcd_cert_refresh: true`다 (2025-05-16 `9c2bdeec6`에서 etcd defaults 분리 때부터). `check_certs.yml`은 이 값이 참이면 파일 존재 여부와 상관없이 `gen_certs`와 `gen_*_certs_True` 그룹을 켠다. 인벤토리에는 오버라이드가 없다.

즉 **버그가 아니라 설계된 동작**이다.

| 가설 | 판정 |
|---|---|
| ansible-core 2.19 템플릿 버그 (upstream #13719, `42aebca4d`에서 수정) | 배제. 수정 반영 후에도 재발급. #13719는 `force_etcd_cert_refresh: false`일 때의 판정 오류를 고친 것 |
| 인증서 파일 누락 | 배제. 노드에 ca·admin·member·node 인증서·키 모두 존재 |
| `force_etcd_cert_refresh` 기본값 `true` | **원인** |

## 접근 비교

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| **A (추천)** | 기본값 유지. 재발급은 정상 동작으로 문서화 | upstream 기본 동작 그대로. 실행할 때마다 leaf 인증서 만료가 연장됨 | 실행마다 etcd·apiserver 인증서 교체 → 재시작 |
| B | `group_vars`에 `force_etcd_cert_refresh: false` | 불필요한 교체 없음. #13719 덕분에 존재 판정이 이제 정확 | leaf 만료 갱신을 따로 챙겨야 함. upstream 기본에서 벗어남 |

A를 추천한다. 단일 노드라 Kubespray 실행 자체가 드물고, 실행 때 컨트롤 플레인 재시작은 어차피 일어난다. 외부로 복사해 쓰는 etcd 클라이언트 인증서도 없다.

## 수용 기준

- [ ] A/B 결정 (사용자)
- [ ] B면 인벤토리에 오버라이드 추가 후 Kubespray 1회 실행에서 `Gen_certs` 태스크가 skip되는지 확인
- [ ] A면 이 문서로 갈음하고 아카이브

## 타임라인

| 일시 | 내용 |
|---|---|
| 2026-11-06 | 등록. 1.36 업그레이드 중 3회 연속 재발급을 별도 이슈로 분리 (사용자). 원인: Kubespray `force_etcd_cert_refresh: true` 기본값. #13719 가설 배제 |
