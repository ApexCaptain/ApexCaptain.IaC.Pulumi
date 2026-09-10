# @common/custom-resources

Pulumi/Terraform provider에 없거나 부족한 리소스·컴포넌트를 직접 구현한 레이어.

## 역할

- **CRD 매핑** — Istio, cert-manager, Cilium, Longhorn, CNPG, VSO CustomResource 타입 정의
- **로컬 리소스** — contract hash 파일(`TextFileV1`)
- **K8s 헬퍼** — kubeconfig 파일(`KubeConfigFileV1`)
- **재사용 컴포넌트** — SFTP adapter, TLS, Vault Secret

## 구조

```
src/
├── components/   # adapter(sftp), secrets, tls, vault
├── data/         # data source (authentik policy expression)
└── resources/
    ├── k8s/crd/  # istio, cert-manager, cilium, longhorn, cnpg, vso
    ├── k8s/      # kube-config-file
    ├── local/    # textFile
    ├── vault/    # bootstrap-token Command
    └── coder/    # admin-api-token Command

scripts/          # Command subprocess (bootstrap/admin token, pod exec)
```

## CRD 네임스페이스

| 패키지 | CRD |
|--------|-----|
| `istio` | VirtualService, Gateway, AuthorizationPolicy, PeerAuthentication, DestinationRule, ServiceEntry, EnvoyFilter |
| `cert-manager` | Certificate, Issuer, ClusterIssuer |
| `cilium` | LoadBalancerIPPool, L2AnnouncementPolicy |
| `longhorn` | Node |
| `cnpg` | Cluster |
| `vso` | VaultConnection, VaultAuth, VaultStaticSecret |

## 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| `SftpV3Component` | Vault SSH CA issue + VSO + CronJob 회전. 라이브: Jellyfin, qBittorrent |
| `SftpV1Component` | tls PrivateKey + ConfigMap. 코드·테스트만 잔존, 스택 호출자 없음 |
| `SecretV1Component` | Vault KV v2 + identity policy + VSO sync (`shared`/`developer`/`runtime`) |
| `PrivateKeyV1Component` | TLS 키 페어 |

## 의존성

- `@common/utils`, `@common/bridged-provider`
- `@pulumi/kubernetes`, `@pulumi/command`, `@pulumi/vault`, `@pulumi/tls`, `@pulumi/random`

## 명령

```bash
pnpm --filter @common/custom-resources build
pnpm --filter @common/custom-resources eslint
pnpm --filter @common/custom-resources test
```

## 참조

`@common/nexus`, `@infra/k8s-workstation-system`, `@infra/k8s-workstation-apps`, `@infra/k8s-workstation-tools`
