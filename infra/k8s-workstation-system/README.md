# @infra/k8s-workstation-system

Workstation 클러스터에 네트워킹·인증서·시크릿·서비스 메시·스토리지·IdP 등 시스템 레이어를 구성하는 Pulumi 스택.

## 역할

- Cilium(CNI) → cert-manager(인증서) → Vault(시크릿) → Istio(서비스 메시) → Longhorn(스토리지) → Authentik(IdP) 순으로 클러스터 기반 레이어를 구성한다.
- Lxcfs, Sysbox, Generic Device Plugin, GPU Operator로 컨테이너 런타임과 호스트 디바이스 노출을 보완한다. 호스트 드라이버·툴킷 설치는 Ansible/Kubespray가 담당하고 이 스택은 RuntimeClass·Operator만 배치한다.
- Snapshot Controller와 pcloud-backup으로 PVC 스냅샷·tar 백업 파이프라인을 제공한다.
- postgresql-operator로 클러스터 내 PostgreSQL 인스턴스를, Vault Secrets Operator로 Vault 시크릿의 K8s 동기화를 관리한다.
- Goldilocks, VPA로 리소스 요청/제한 추천 및 자동 조정을, Reloader로 ConfigMap/Secret 변경 시 워크로드 재시작을 처리한다.
- Argo(CD, Rollouts, GitOps, service mesh, Authentik 연동)로 GitOps 배포 파이프라인을 구성한다. GitOps 레포 정체성 자체는 `@infra/github`의 `githubContract`가 갖고, 이 스택은 deploy key·webhook만 붙인다.
- Monitoring 컴포넌트(OTel Operator, Tempo 등)로 관측 스택을 배치하며, apps/tools 스택은 이 스택의 output을 참조해 자신의 리소스를 구성한다.

## Pulumi 프로젝트

- ESC: `commonEsc`, `k8sWorkstationSystemEsc`(project), `githubEsc`, `ociEsc`를 참조한다.
- K8s 대상은 `commonEsc.esc.workstationKubeconfig`로 접근하는 Workstation 클러스터 하나다.

## 배포 순서

- workspace 전체 순서: `cloudflare → k8s-workstation-system → k8s-workstation-apps / k8s-workstation-tools`.
- 스택 내부에서 꼬이기 쉬운 의존 구간:
  - Vault는 cert-manager가 발급한 CA에 의존하고, mesh ingress는 Let's Encrypt wildcard cert에 의존한다.
  - Authentik의 PostgreSQL은 Longhorn SSD StorageClass에, Longhorn UI는 Authentik proxy 인증에 의존한다. 이 순환을 끊기 위해 Longhorn↔Authentik 배포가 3단계로 분리되어 있다.

## upstream / downstream

- upstream: `@infra/cloudflare`(cert-manager DNS-01 토큰), `@infra/github`(`githubContract` — GitOps 레포 정체성, deploy key·webhook 대상).
- downstream: `@infra/k8s-workstation-apps`, `@infra/k8s-workstation-tools`가 이 스택의 output/secret을 참조한다.

## 구조

```
src/
└── components/
└──   argo/
└──     argo.authentik.component.ts
└──     argo.cd.component.ts
└──     argo.git-ops.component.ts
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
└──     index.ts
└──     istio.gateway.component.ts
└──     istio.helm-chart.component.ts
└──   longhorn/
└──     index.ts
└──     longhorn.helm-chart.component.ts
└──     longhorn.resources.component.ts
└──     longhorn.service-mesh.component.ts
└──   lxcfs/
└──     index.ts
└──     lxcfs.helm-chart.component.ts
└──   monitoring/
└──     alerting/
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
