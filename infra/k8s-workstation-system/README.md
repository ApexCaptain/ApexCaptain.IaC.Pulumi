# @infra/k8s-workstation-system

Workstation Kubernetes 클러스터에 플랫폼·GitOps·IdP·스토리지·DB/캐시 오퍼레이터를 올리는 Pulumi 시스템 스택이다.

## 역할

- Cilium, cert-manager, Vault, Istio, Longhorn, CNPG·Redis Operator, Authentik, Argo CD 등 클러스터 공통 인프라를 한 스택에서 정의한다.
- `@infra/cloudflare`의 DNS/API 자격 증명으로 cert-manager Issuer를 구성하고, `@infra/github`의 GitOps 레포 정체성에 deploy key·webhook만 연결한다.
- `src/contract.ts`는 `src/phases/` 조립 함수를 순서대로 호출하고 `output`·`secret`만 매핑한다. 컴포넌트 생성은 각 phase가 담당한다.
- `output`·`secret`을 `@infra/k8s-workstation-apps`, `@infra/k8s-workstation-tools`가 참조한다.

## Pulumi 프로젝트

- 패키지 루트의 Pulumi 프로젝트 설정을 따른다. ESC는 `commonEsc`, `k8sWorkstationSystemEsc`, `githubEsc`, `ociEsc` 등 nexus ESC 바인딩을 사용한다.
- Workstation 클러스터에는 `workstationKubeconfig`(common ESC)로 Kubernetes Provider를 붙인다.

## 배포 순서

모노레포 infra 스택 순서:

```
cloudflare → k8s-workstation-system → k8s-workstation-apps
                                   → k8s-workstation-tools
```

이 스택 내부에서 의존이 얽히기 쉬운 구간:

1. **Cilium** → **cert-manager**(Helm + Cloudflare Issuer/CA 리소스)
2. **cert-manager CA** → **Vault**; **Let's Encrypt wildcard** → **Istio ingress gateway**
3. **snapshot-controller** → Longhorn·Platform VolumeSnapshotClass 등 스냅샷 선행
4. **Longhorn**(SSD StorageClass 등) → **Authentik** PostgreSQL; **Authentik proxy outpost** → Longhorn UI 등 mesh·프록시 보호 대상
5. **Vault**·**vault-secrets-operator** → 앱 시크릿 패턴; **postgresql-operator**·**redis-operator** → Argo·Authentik 등 데이터 계층
6. **Authentik**·**Istio** → Argo·Goldilocks·Monitoring 등 service-mesh·Authentik 연동 컴포넌트

호스트 측 **Sysbox**·**GPU driver/toolkit** 설치는 Ansible/Kubespray; 이 스택은 RuntimeClass·Operator·Helm 위주다.

## upstream / downstream

| 방향 | 패키지 | 참조 내용 |
|------|--------|-----------|
| upstream | `@infra/cloudflare` | Cloudflare API token·email(cert-manager DNS-01 등) |
| upstream | `@infra/github` | GitOps 레포·조직 정체성 |
| downstream | `@infra/k8s-workstation-apps` | 시스템 스택 `output`·`secret` |
| downstream | `@infra/k8s-workstation-tools` | 시스템 스택 `output`·`secret` |

## 시스템 컴포넌트

| 디렉터리 | 담당 |
|----------|------|
| `cilium` | CNI·클러스터 네트워킹 리소스 |
| `lxcfs` | lxcfs Helm(컨테이너 리소스 뷰) |
| `sysbox` | Sysbox RuntimeClass |
| `generic-device-plugin` | 호스트 `/dev` extended resource |
| `gpu-operator` | GPU RuntimeClass·NVIDIA GPU Operator |
| `cert-manager` | cert-manager Helm·Issuer/CA·wildcard 등 |
| `snapshot-controller` | VolumeSnapshot CRD·controller |
| `vault` | Vault 클러스터·정책 등 |
| `vault-secrets-operator` | Vault Secrets Operator |
| `istio` | Istio Helm·gateway·CNI reboot repair |
| `longhorn` | Longhorn Helm·StorageClass·UI·리소스 |
| `postgresql-operator` | CloudNative PG Operator |
| `redis-operator` | Redis Operator |
| `authentik` | Authentik Helm·outpost·mesh 연동 |
| `argo` | Argo CD·Rollouts·GitOps·Redis·Authentik·mesh |
| `monitoring` | 모니터링 스택 |
| `goldilocks` | Goldilocks·mesh |
| `vpa` | Vertical Pod Autoscaler |
| `reloader` | Stakater Reloader |
| `pcloud-backup` | pCloud 백업 연동 |

## 단계 모듈 (`src/phases/`)

contract 호출 순서가 배포 순서다. Longhorn ↔ Authentik은 Outpost 순환을 피하려고 3단계로 나눈다.

| 파일 | 함수 | 담당 |
|------|------|------|
| `providers.ts` | `deployProviders` | Kubernetes 등 Provider |
| `node-runtime.ts` | `deployNodeRuntime` | Sysbox, lxcfs, generic-device-plugin, GPU |
| `cert-manager.ts` | `deployCertManager` | cert-manager Helm·Issuer/CA |
| `backup-platform.ts` | `deployBackupPlatform` | snapshot-controller, pCloud |
| `vault.ts` | `deployVaultServer`, `deployVaultAccess`, `deployVaultIdentity`, `deployVaultSecretsOperator` | Vault 서버 → 접근 경로 → Identity → VSO |
| `mesh.ts` | `deployMesh` | Istio Helm·gateway |
| `data-operators.ts` | `deployDataOperators` | CloudNative PG, Redis Operator |
| `longhorn.ts` | `deployLonghorn`, `deployLonghornServiceMesh` | Longhorn, 이후 Authentik proxy 연동 |
| `authentik.ts` | `deployAuthentik`, `deployAuthentikOutpost` | 그룹/플로 (Outpost 없음) → Longhorn mesh 이후 Outpost |
| `autoscaling.ts` | `deployAutoscaling` | Goldilocks, VPA |
| `reloader.ts` | `deployReloader` | Stakater Reloader |
| `argo.ts` | `deployArgo` | Argo CD·Rollouts·GitOps |
| `monitoring.ts` | `deployMonitoring` | 모니터링 스택 |
| `constants.ts` | `authentikNames` | Authentik 리소스 이름 상수 |

리소스 이름·parent를 바꾸면 URN이 바뀐다. output 객체 키 순서는 contract hash에 들어가므로 바꾸지 않는다.

## 구조

```
src/
└── components/
└──   argo/
└──   authentik/
└──   cert-manager/
└──   cilium/
└──   generic-device-plugin/
└──   goldilocks/
└──   gpu-operator/
└──   istio/
└──   longhorn/
└──   lxcfs/
└──   monitoring/
└──   pcloud-backup/
└──   postgresql-operator/
└──   redis-operator/
└──   reloader/
└──   snapshot-controller/
└──   sysbox/
└──   vault/
└──   vault-secrets-operator/
└──   vpa/
└── contract.ts
└── index.ts
└── phases/
└──   argo.ts
└──   authentik.ts
└──   autoscaling.ts
└──   backup-platform.ts
└──   cert-manager.ts
└──   constants.ts
└──   data-operators.ts
└──   index.ts
└──   longhorn.ts
└──   mesh.ts
└──   monitoring.ts
└──   node-runtime.ts
└──   providers.ts
└──   reloader.ts
└──   vault.ts
```

## 의존성

- `@common/bridged-provider` (workspace:*)
- `@common/custom-resources` (workspace:*)
- `@common/nexus` (workspace:*)
- `@common/utils` (workspace:*)
- `@infra/cloudflare` (workspace:*)
- `@infra/github` (workspace:*)
- `@pulumi/command` (^1.2.1)
- `@pulumi/github` (^6.14.0)
- `@pulumi/kubernetes` (^4.31.1)
- `@pulumi/oci` (^4.14.0)
- `@pulumi/pulumi` (^3.242.0)
- `@pulumi/random` (^4.21.0)
- `@pulumi/tls` (^5.5.0)
- `@pulumi/vault` (^7.10.0)
- `@pulumiverse/time` (^v0.1.1)
- `cron-time-generator` (^2.0.3)
- `dedent` (^1.7.2)
- `lodash` (^4.18.1)
- `timezone-enum` (^1.0.4)
- `yaml` (^2.8.3)

## 명령

```bash
pnpm --filter @infra/k8s-workstation-system build
pnpm --filter @infra/k8s-workstation-system eslint
pnpm --filter @infra/k8s-workstation-system test
pnpm --filter @infra/k8s-workstation-system pulumi:preview
pnpm --filter @infra/k8s-workstation-system pulumi:up
```
