# @common/custom-resources

Pulumi/Terraform provider에 없거나 부족한 리소스·컴포넌트를 직접 구현한 레이어.

## 역할

- **CRD 매핑** — Istio, cert-manager, Cilium, Longhorn, CNPG 등 CustomResource 타입 정의
- **로컬 리소스** — contract hash 파일(`TextFileV1`) 등
- **K8s 헬퍼** — kubeconfig 파일(`KubeConfigFileV1`)
- **재사용 컴포넌트** — SFTP adapter, TLS, secrets

## 구조

```
src/
├── components/   # adapter(sftp), secrets, tls
├── data/         # data source
└── resources/
    ├── k8s/crd/  # istio, cert-manager, cilium, longhorn, cnpg
    ├── k8s/      # kube-config-file
    ├── local/    # textFile
    └── vault/    # bootstrap-token Command

scripts/          # Command subprocess (bootstrap token, pod exec)
```

## CRD 네임스페이스

| 패키지 | CRD |
|--------|-----|
| `istio` | VirtualService, Gateway, AuthorizationPolicy, PeerAuthentication, … |
| `cert-manager` | Certificate, Issuer, ClusterIssuer |
| `cilium` | LoadBalancerIPPool, L2AnnouncementPolicy |
| `longhorn` | Node |
| `cnpg` | Cluster |

## 의존성

- `@common/utils`, `@common/bridged-provider`
- `@pulumi/kubernetes`, `@pulumi/command`, `@pulumi/vault`, …

## 명령

```bash
pnpm --filter @common/custom-resources build
pnpm --filter @common/custom-resources eslint
```
