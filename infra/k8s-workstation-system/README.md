# @infra/k8s-workstation-system

Workstation 클러스터의 "시스템" 레이어 — 네트워킹, 인증서, 시크릿, 서비스 메시, 스토리지, IdP를 구성하는 Pulumi 스택.

## 역할

- 네트워킹·런타임: Cilium(CNI), Lxcfs, Sysbox RuntimeClass, Generic Device Plugin(호스트 `/dev` extended resource 노출), GPU Operator(RuntimeClass + Operator, 호스트 driver/toolkit은 Ansible)
- 인증서·시크릿: cert-manager(ClusterIssuer, Cloudflare DNS01), Vault, Vault Secrets Operator
- 서비스 메시·IdP: Istio(mesh, 재부팅 후 CNI 복구 스크립트 포함), Authentik(IdP, proxy outpost)
- 스토리지·백업: Longhorn, snapshot-controller(VolumeSnapshot CRD/controller), pcloud-backup
- GitOps·배포: Argo CD, Argo Rollouts
- 관측성: monitoring(Grafana, Loki, Tempo, VictoriaMetrics, OTel Operator)
- 리소스 최적화: Goldilocks, VPA
- 운영 보조: Reloader, PostgreSQL Operator
- GitHub 연동은 `githubContract`가 정체성을 갖고, 이 스택은 deploy key·webhook만 붙인다.

## Pulumi 프로젝트

- ESC: `commonEsc`(workstation kubeconfig 등 공용 값), `k8sWorkstationSystemEsc`(프로젝트 전용 값), `githubEsc`(GitHub 토큰), `ociEsc`(OCI 인증)
- 주요 Provider: `workstationK8sProvider`(Kubernetes), `apexCaptainGithubProvider`(GitHub), `ociProvider`(OCI)

## 배포 순서

Cilium → cert-manager → Vault → Istio mesh → Longhorn → Authentik 순으로 적재하고, apps/tools 스택이 이 스택의 output을 참조한다.

- Vault는 cert-manager가 발급한 CA에 의존하고, mesh ingress는 Let's Encrypt wildcard cert에 의존한다.
- Authentik PostgreSQL은 Longhorn SSD StorageClass에, Longhorn UI는 Authentik proxy에 의존한다. 이 순환을 끊기 위해 Longhorn↔Authentik 배포가 3단계로 분리되어 있다(각 컴포넌트 JSDoc 참고).

## upstream / downstream

- upstream: `@infra/cloudflare`(cert-manager DNS01용 Cloudflare API 토큰·이메일), `@infra/github`(GitHub provider 토큰, deploy key·webhook 연동)
- downstream: k8s-workstation-apps, k8s-workstation-tools 스택이 이 스택의 output(kubeconfig, provider, mesh/스토리지/IdP 관련 값)을 참조한다.

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
└──     longhorn.service-mesh.component.ts
└──   lxcfs/
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
