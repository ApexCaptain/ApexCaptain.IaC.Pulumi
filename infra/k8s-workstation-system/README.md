# @infra/k8s-workstation-system

Workstation K8s 클러스터 **시스템 레이어** Pulumi 스택.

## 역할

클러스터 공통 인프라를 한 스택에서 관리하고, apps/tools 스택이 `k8sWorkstationSystemContract` output을 참조함.

### 배포 순서 (의존 관계)

```
Cilium
  → lxcfs / sysbox / generic-device-plugin / gpu-operator
  → cert-manager → Istio → CNPG operator
  → Vault → Longhorn
  → Authentik (Longhorn UI proxy/outpost 3단계 분리)
  → Vault Secrets Operator → Reloader
  → Argo (Rollouts → GitOps → Authentik OIDC → CD → mesh → resources)
  → monitoring (OTel, VictoriaMetrics, Loki, Tempo, Grafana)
```

### 주요 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| `cilium` | CNI |
| `lxcfs` | 컨테이너 `/proc` 가상화 (Coder workspace 등) |
| `sysbox` | RuntimeClass (호스트 설치는 Ansible/Kubespray) |
| `genericDevicePlugin` | 호스트 `/dev` extended resource 노출 |
| `gpuOperator` | NVIDIA GPU RuntimeClass + Operator |
| `certManager` | LE wildcard cert, ClusterIssuer |
| `istio` | ambient mesh, ingress/direct gateway |
| `postgresqlOperator` | CloudNativePG operator |
| `vault` | Helm + KMS unseal + mesh ingress + Authentik OIDC + Coder JWT |
| `longhorn` | 스토리지 + Authentik proxy UI |
| `authentik` | IdP Helm + mesh + groups/flows/outpost |
| `vaultSecretsOperator` | VSO Helm + VaultConnection |
| `reloader` | Stakater Reloader |
| `argo` | Rollouts, Argo CD (GitOps repo + Authentik OIDC + mesh) |
| `monitoring` | OTel operator, VictoriaMetrics, Loki, Tempo, Grafana + Authentik OIDC + mesh ingress |

### Contract export (요약)

- `output`: namespaces, gateway paths, storage classes, sysbox/lxcfs/gpu, authentik group/flow/outpost, vaultSecretsOperator, vault host/coderJwt
- `secret`: authentik/vault provider config, vault OIDC/JWT mount accessor, kv mount, k8s auth mount path

## Pulumi 프로젝트

| 항목 | 값 |
|------|-----|
| 기본 스택 | `prod` |
| ESC | `k8sWorkstationSystemEsc`, `commonEsc`, `ociEsc`, `githubEsc` |

## 구조

```
src/
├── contract.ts
└── components/
    ├── cilium/
    ├── lxcfs/
    ├── sysbox/
    ├── generic-device-plugin/
    ├── gpu-operator/
    ├── cert-manager/
    ├── istio/
    ├── postgresql-operator/
    ├── vault/
    ├── longhorn/
    ├── authentik/
    ├── vault-secrets-operator/
    ├── reloader/
    ├── argo/
    └── monitoring/
```

## 의존성

- `@infra/cloudflare`
- `@common/nexus`, `@common/utils`, `@common/custom-resources`, `@common/bridged-provider`
- `@pulumi/github`, `@pulumi/kubernetes`, `@pulumi/oci`, `@pulumi/vault`

## 명령

```bash
pnpm --filter @infra/k8s-workstation-system build
pnpm --filter @infra/k8s-workstation-system pulumi:preview
pnpm --filter @infra/k8s-workstation-system pulumi:up
```

## upstream / downstream

- **upstream**: `@infra/cloudflare`
- **downstream**: `@infra/k8s-workstation-apps`, `@infra/k8s-workstation-tools`
