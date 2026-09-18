# @common/custom-resources

Pulumi 컴포넌트·리소스·데이터 소스를 모아둔 커스텀 라이브러리 패키지.

## 역할

- `components/adapter`: SFTP 어댑터 컴포넌트(`sftp.v1`, `sftp.v3`)와 v3 issuer job 템플릿을 제공한다.
- `components/backup`: PVC 스냅샷 아카이브, Vault Raft 아카이브 백업 컴포넌트를 제공한다.
- `components/tls`: TLS private key 컴포넌트를 제공한다.
- `components/vault`: Vault Secret 컴포넌트와 KV v2 UI browse 정책을 제공한다.
- `resources/coder`: Coder admin API token 커스텀 리소스를 제공한다.
- `resources/k8s`: kube-config-file 리소스와 cert-manager·cilium·cnpg·istio·longhorn·vso CRD 타입을 제공한다.
- `resources/local`: 로컬 텍스트 파일 리소스를 제공한다.
- `resources/vault`: Vault bootstrap token 리소스를 제공한다.
- `data/authentik`: Authentik policy expression 데이터 소스를 제공한다.
- `index.ts`에서 `components`, `resources`, `data` 세 네임스페이스로 재export한다.

## 구조

```
src/
└── components/
└──   adapter/
└──     index.ts
└──     sftp-v3-issuer-job.template.ts
└──     sftp.v1.component.ts
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
- `axios` (^1.15.2)
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
