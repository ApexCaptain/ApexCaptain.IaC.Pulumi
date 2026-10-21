# @common/custom-resources

Pulumi 기반으로 Kubernetes·Vault·Coder 등에 걸친 재사용 컴포넌트, 커스텀 리소스, 데이터 소스를 한곳에 모은 공통 라이브러리.

## 역할

- **components**: SFTP 어댑터, PVC/Vault Raft 백업 아카이브, TLS 개인키, Vault 시크릿·KV 정책 등 인프라 패턴을 컴포넌트로 캡슐화함.
- **resources**: Coder 관리 API 토큰, kubeconfig 파일, 로컬 텍스트 파일, Vault 부트스트랩 토큰, cert-manager·Cilium·CloudNativePG·Istio·Longhorn·Redis Operator·VSO 등 CRD 정의를 Pulumi 리소스로 제공함.
- **data**: Authentik 정책 표현식 등 외부 API·설정을 Pulumi data 소스로 조회함.
- `@common/bridged-provider`·`@common/utils`와 함께 `@infra/*` 및 기타 workspace 패키지에서 IaC 조합의 빌딩 블록으로 사용함.

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
