# @infra/k8s-workstation-system

Workstation Kubernetes 클러스터에 인증·서비스 메시·스토리지·백업·GitOps 등 클러스터 공통 시스템 레이어를 Pulumi로 배포하는 스택이다.

## 역할

- `@infra/cloudflare` 등 upstream 출력(DNS·레코드 등)을 참조해 클러스터 단위 시스템 컴포넌트를 조립한다.
- Istio 기반 서비스 메시, cert-manager, Vault, Authentik, Longhorn, 데이터 오퍼레이터, 모니터링·Argo 등을 단계(`./phases`) 순서로 배포한다.
- 스택 output·secret을 `@infra/k8s-workstation-apps`, `@infra/k8s-workstation-tools` 등 downstream 스택이 참조한다.

## Pulumi 프로젝트

- 패키지 루트의 `Pulumi.yaml` 및 스택별 설정 파일이 프로젝트·스택 이름을 정의한다.
- 시크릿·환경 값은 ESC 등 프로젝트 표준 방식으로 주입하며, README에는 실제 값을 기재하지 않는다.

## 배포 순서

모노레포 infra 스택 관점의 선행 관계는 다음과 같다.

```
cloudflare → k8s-workstation-system → k8s-workstation-apps
                                   → k8s-workstation-tools
```

본 스택 내부는 `contract.ts`가 호출하는 `phases` 함수 순서가 배포 순서이며, 단계 간 의존은 인자로 넘긴 이전 단계 결과와 각 컴포넌트의 `dependsOn`으로 표현된다.

대략적인 단계 흐름은 아래와 같다.

1. Providers, 노드 런타임(Kata, GPU Operator)
2. cert-manager, pCloud 백업 플랫폼
3. Vault 서버(cert-manager CA 의존)
4. Istio 메시(ingress는 LE wildcard 인증서 등 cert-manager에 의존)
5. 데이터 오퍼레이터(PostgreSQL·Redis Operator 등)
6. Vault 접근 경로(ingress·Provider 등, 메시 이후)
7. Longhorn
8. Authentik(Longhorn SSD StorageClass에 PG PVC 의존, Outpost는 이후 단계로 분리)
9. Vault Identity(Authentik 연동)
10. Longhorn 서비스 메시(Authentik proxy·ProviderProxy)
11. Authentik Outpost(Longhorn provider bootstrap)
12. 오토스케일링(Goldilocks, VPA 등, proxy outpost 이후)
13. Vault Secrets Operator, Reloader
14. Argo CD·Rollouts·GitOps
15. Monitoring

꼬이기 쉬운 구간은 contract JSDoc과 동일하다. Vault는 cert-manager CA에, mesh ingress는 LE wildcard에 의존한다. Longhorn UI는 Authentik proxy outpost(Istio ext-authz)로 보호되며, Authentik PostgreSQL PVC는 Longhorn storage class에 의존하므로 Longhorn↔Authentik은 `deployAuthentik` → `deployLonghornServiceMesh` → `deployAuthentikOutpost` 세 단계로 나뉜다. apps·tools에서 추가되는 proxy outpost 앱은 OutpostProviderAttachment로 연결한다.

리소스 이름·parent 변경 시 URN이 바뀌므로 단계 이동은 `pulumi:preview` diff 0으로 확인한다. output 객체 키 순서는 contract hash에 포함되므로 변경하지 않는다.

## upstream / downstream

| 방향 | 패키지 | 관계 |
|------|--------|------|
| upstream | `@infra/cloudflare` | `cloudflareContract`(예: Vault 호스트 DNS 레코드 등) 참조 |
| upstream | `@infra/github` | GitHub 관련 리소스·설정 의존(패키지 의존성 기준) |
| downstream | `@infra/k8s-workstation-apps` | 본 스택 `output`·`secret` 참조 |
| downstream | `@infra/k8s-workstation-tools` | 본 스택 `output`·`secret` 참조 |

export 진입점은 `src/index.ts`의 `output`, `secret`(`k8sWorkstationSystemContract`).

## 현재 시스템 컴포넌트

`src/components` 기준으로 관리하는 영역이다.

| 영역 | 구성 요약 |
|------|-----------|
| **cert-manager** | CA·와일드카드 인증서, Vault·mesh ingress 선행 요건 |
| **istio** | Helm, Gateway(ingress·direct 경로), CNI 재부팅 복구 등 |
| **cilium** | CNI 관련 리소스 |
| **vault** | Vault 서버, mesh·백업·K8s auth, Authentik·Coder JWT identity |
| **vault-secrets-operator** | VSO Helm·Vault 연결 리소스 |
| **longhorn** | 분산 스토리지, StorageClass output |
| **authentik** | IdP Helm, flows·groups, proxy outpost(3단계 분리) |
| **postgresql-operator / redis-operator** | 클러스터 데이터 오퍼레이터 |
| **pcloud-backup** | pCloud 백업 플랫폼·클러스터 메타 output |
| **snapshot-controller** | 볼륨 스냅샷 컨트롤러 |
| **gpu-operator / kata** | GPU RuntimeClass·Kata 런타임 |
| **goldilocks / vpa** | 리소스 권장·Vertical Pod Autoscaler |
| **reloader** | 설정 변경 시 워크로드 재시작 |
| **argo** | Argo CD, Rollouts, GitOps, Redis, Authentik·mesh 연동 |
| **monitoring** | 클러스터 모니터링 스택 |

스택 output 예시(키만): `namespaces.istio`, `serviceMesh`, `gatewayPaths`, `storageClasses`, `kata`, `gpu`, `authentik`(flow·groupIds·proxy outpost), `vaultSecretsOperator`, `vault`(host·coderJwt·identityGroupIds), `pcloudBackup` 등. 전체 스키마는 `contract.ts`의 return `output`을 본다.

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
└──   kata/
└──     index.ts
└──     kata.component.ts
└──   longhorn/
└──     index.ts
└──     longhorn.helm-chart.component.ts
└──     longhorn.resources.component.ts
└──     …
└──   …
└── …
```

배포 조립 로직은 `src/phases`에 단계별로 분리되어 있으며, contract 비대화 분해 이력은 [docs/issues/resolved/2026-10-17-system-contract-split.md](docs/issues/resolved/2026-10-17-system-contract-split.md)를 참조한다.

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
