# @infra/k8s-workstation-system

Workstation Kubernetes 클러스터에 플랫폼·GitOps·IdP·스토리지·DB/캐시 오퍼레이터를 올리는 Pulumi 시스템 스택이다.

## 역할

- Cilium, cert-manager, Vault, Istio, Longhorn, CNPG·Redis Operator, Authentik, Argo CD 등 클러스터 공통 인프라를 한 스택에서 정의한다.
- `@infra/cloudflare`의 DNS/API 자격 증명으로 cert-manager Issuer를 구성하고, `@infra/github`의 GitOps 레포 정체성에 deploy key·webhook만 연결한다.
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

## 구조

```
src/
└── components/
└──   argo/
└──     argo.authentik.component.ts
└──     argo.cd.component.ts
└──     argo.cd.redis.ts
└──     argo.git-ops.component.ts
└──     argo.redis-acl.ts
└──     argo.resources.component.ts
└──     argo.rollouts.component.ts
└──     argo.service-mesh.component.ts
└──     index.ts
└──   authentik/
└──     authentik.helm-chart.component.ts
└──     authentik.outpost.component.ts
└──     authentik.resources.component.ts
└──     authentik.service-mesh.component.ts
└──     index.ts
└──   cert-manager/
└──     cert-manager.helm-chart.component.ts
└──     cert-manager.resources.component.ts
└──     index.ts
└──   cilium/
└──     cilium.resources.component.ts
└──     index.ts
└──   generic-device-plugin/
└──     generic-device-plugin.helm-chart.component.ts
└──     index.ts
└──   goldilocks/
└──     goldilocks.helm-chart.component.ts
└──     goldilocks.service-mesh.component.ts
└──     index.ts
└──   gpu-operator/
└──     gpu-operator.helm-chart.component.ts
└──     gpu-runtime-class.component.ts
└──     index.ts
└──   index.ts
└──   istio/
└──     assets/
└──       istio-cni-reboot-repair.sh
└──       istio-cni-reboot-repair.test.sh
└──     index.ts
└──     istio-cni-reboot-repair.component.ts
└──     istio.gateway.component.ts
└──     istio.helm-chart.component.ts
└──   longhorn/
└──     index.ts
└──     longhorn.helm-chart.component.ts
└──     longhorn.resources.component.ts
└──     …
└──   …
└── …
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
