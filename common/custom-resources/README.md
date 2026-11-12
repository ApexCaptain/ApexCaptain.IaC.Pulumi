# @common/custom-resources

Pulumi용 커스텀 컴포넌트·리소스·데이터 소스를 모아 infra 스택에서 재사용하는 공통 패키지.

## 역할

- **컴포넌트(`components`)**: SFTP 발급 Job, PVC 스냅샷·Vault Raft 아카이브, TLS 개인키, Vault KV 시크릿·정책 등 고수준 추상화를 제공한다.
- **리소스(`resources`)**: Coder API 토큰, kubeconfig 파일, 로컬 텍스트 파일, Vault 부트스트랩 토큰, Kubernetes CRD 래퍼(cert-manager, Cilium, CNPG, Istio, Longhorn, Redis Operator, VSO 등)를 선언한다.
- **데이터(`data`)**: Authentik 정책 표현식 등 런타임 조회용 데이터 소스를 export한다.
- `@common/bridged-provider`, `@common/utils`와 함께 모노레포 infra 패키지에서 일관된 IaC 패턴을 쓰기 위한 기반 레이어이다.

## 구조

```
src/
└── components/
└──   adapter/
└──     index.ts
└──     sftp-v3-issuer-job.template.ts
└──     sftp.v3.component.ts
└──   backup/
└──     index.ts
└──     pvc-snapshot-archive.v1.component.ts
└──     vault-raft-archive.v1.component.ts
└──   index.ts
└──   tls/
└──     index.ts
└──     private-key.v1.component.ts
└──   vault/
└──     index.ts
└──     kv-v2-ui-browse.policy.ts
└──     secret.v1.component.ts
└── data/
└──   authentik/
└──     index.ts
└──     policy-expression.v1.data.ts
└──   index.ts
└── index.ts
└── resources/
└──   coder/
└──     admin-api-token.v1.res.ts
└──     index.ts
└──   index.ts
└──   k8s/
└──     crd/
└──       cert-manager/
└──       cilium/
└──       cnpg/
└──       index.ts
└──       istio/
└──       longhorn/
└──       redis-operator/
└──       vso/
└──     index.ts
└──     kube-config-file.v1.res.ts
└──   local/
└──     index.ts
└──     textFile.v1.res.ts
└──   vault/
└──     bootstrap-token.v1.res.ts
└──     index.ts
```

## 의존성

- `@common/bridged-provider` (workspace:*)
- `@common/utils` (workspace:*)
- `@kubernetes/client-node` (^1.4.0)
- `@pulumi/command` (^1.2.1)
- `@pulumi/kubernetes` (^4.31.1)
- `@pulumi/pulumi` (^3.242.0)
- `@pulumi/random` (^4.21.0)
- `@pulumi/tls` (^5.5.0)
- `@pulumi/vault` (^7.10.0)
- `axios` (^1.20.0)
- `dedent` (^1.7.2)
- `flat` (^6.0.1)
- `lodash` (^4.18.1)
- `yaml` (^2.8.3)

## 명령

```bash
pnpm --filter @common/custom-resources build
pnpm --filter @common/custom-resources eslint
pnpm --filter @common/custom-resources test
```
