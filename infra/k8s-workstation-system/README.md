# @infra/k8s-workstation-system

Workstation K8s 클러스터 **시스템 레이어** Pulumi 스택.

## 역할

클러스터 공통 인프라를 한 스택에서 관리하고, apps/tools 스택이 `k8sWorkstationSystemContract` output을 참조함.

### 배포 순서 (의존 관계)

```
Cilium → cert-manager → Vault → Istio → CNPG operator
       → Longhorn → Authentik → Vault/Authentik OIDC → Longhorn mesh → Authentik Outpost
```

### 주요 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| `cilium` | CNI |
| `certManager` | LE wildcard cert, ClusterIssuer |
| `vault` | Helm + KMS unseal + mesh ingress + Authentik OIDC |
| `istio` | ambient mesh, ingress/direct gateway |
| `postgresqlOperator` | CloudNativePG operator |
| `longhorn` | 스토리지 + Authentik proxy UI |
| `authentik` | IdP Helm + mesh + groups/flows/outpost |

### Contract export (요약)

- `output`: namespaces, gateway paths, storage classes, authentik group/flow/outpost
- `secret`: authentik/vault provider config, vault OIDC mount accessor

## Pulumi 프로젝트

| 항목 | 값 |
|------|-----|
| 기본 스택 | `prod` |
| ESC | `k8sWorkstationSystemEsc`, `commonEsc`, `ociEsc` |

## 구조

```
src/
├── contract.ts
└── components/
    ├── cilium/
    ├── cert-manager/
    ├── vault/
    ├── istio/
    ├── postgresql-operator/
    ├── longhorn/
    └── authentik/
```

## 의존성

- `@infra/cloudflare`
- `@common/nexus`, `@common/utils`, `@common/custom-resources`, `@common/bridged-provider`

## 명령

```bash
pnpm --filter @infra/k8s-workstation-system build
pnpm --filter @infra/k8s-workstation-system pulumi:preview
pnpm --filter @infra/k8s-workstation-system pulumi:up
```

## upstream / downstream

- **upstream**: `@infra/cloudflare`
- **downstream**: `@infra/k8s-workstation-apps`, `@infra/k8s-workstation-tools`
