# Monitoring OTel Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `infra/k8s-workstation-system`에 OpenTelemetry Operator 기반 통합 모니터링 스택(VictoriaMetrics, Loki, Tempo, Grafana, Collector, Instrumentation)을 Pulumi ComponentResource로 구축한다.

**Architecture:** 관심사별 8개 컴포넌트를 `src/components/monitoring/`에 두고, `contract.ts`에서 cert-manager → OTel Operator → 백엔드(병렬) → Grafana Authentik OIDC → Grafana Helm → OTel CR → Grafana VirtualService 순으로 배선한다. 스토리지는 Longhorn `longhorn-ssd`, 외부 노출은 Grafana만.

**Tech Stack:** Pulumi TypeScript, `@pulumi/kubernetes` Helm Release + CustomResource, Authentik bridged provider, Istio VirtualService CRD, project/common ESC.

## Global Constraints

- Namespace: `monitoring` (OTel Operator 컴포넌트가 생성, 나머지는 output namespace 재사용)
- StorageClass: `longhorn-ssd`
- Retention defaults: VM 15d, Loki 7d, Tempo 3d
- Grafana auth: Authentik OIDC; `System User` → Viewer, `System Manager` → Admin; Proxy/ext-authz 없음
- Grafana admin: `GRAFANA_ADMIN_PASSWORD` env → project ESC `grafana.adminPassword` (평문)
- OTel Operator webhook: `admissionWebhooks.certManager.enabled=true`
- Grafana Ingress: disabled; Istio VirtualService only
- Cloudflare DNS: 기존 `records.grafana` 사용 (신규 레코드 없음)
- Helm chart versions (2026-08-07 기준): opentelemetry-operator `0.120.2`, victoria-metrics-single `0.44.0`, loki `7.2.0`, tempo `1.24.4`, grafana `10.5.15`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/constants.ts` | Helm repo URL 3개 추가 |
| Modify | `common/nexus/src/esc/common.esc.ts` | `helmRepositoryUrls` zod 스키마 |
| Modify | `common/nexus/src/esc/k8s-workstation-system.esc.ts` | `grafana.adminPassword` |
| Modify | `.projenrc.ts` | ESC upsert + env 매핑 |
| Create | `infra/k8s-workstation-system/src/components/monitoring/index.ts` | re-export |
| Create | `.../otel-operator.helm-chart.component.ts` | NS + Operator |
| Create | `.../victoria-metrics.helm-chart.component.ts` | VM single |
| Create | `.../loki.helm-chart.component.ts` | Loki SingleBinary |
| Create | `.../tempo.helm-chart.component.ts` | Tempo single |
| Create | `.../grafana.authentik.component.ts` | OIDC Provider/App |
| Create | `.../grafana.helm-chart.component.ts` | Grafana + datasources + OIDC |
| Create | `.../otel.resources.component.ts` | Collector + Instrumentation CR |
| Create | `.../grafana.service-mesh.component.ts` | VirtualService |
| Modify | `infra/k8s-workstation-system/src/components/index.ts` | `export * as monitoring` |
| Modify | `infra/k8s-workstation-system/src/contract.ts` | 전체 배선 |
| Modify | `infra/k8s-workstation-system/README.md` | 컴포넌트·배포 순서 갱신 |

---

### Task 1: ESC · Helm Repository 기반

**Files:**
- Modify: `src/constants.ts`
- Modify: `common/nexus/src/esc/common.esc.ts`
- Modify: `common/nexus/src/esc/k8s-workstation-system.esc.ts`
- Modify: `.projenrc.ts`

**Interfaces:**
- Consumes: `process.env.GRAFANA_ADMIN_PASSWORD`
- Produces: `commonEsc.esc.helmRepositoryUrls['open-telemetry.github.io/opentelemetry-helm-charts']`, `['victoriametrics.github.io/helm-charts']`, `['grafana.github.io/helm-charts']`; `projectEsc.esc.grafana.adminPassword`

- [ ] **Step 1: `src/constants.ts`에 repo URL 추가**

```typescript
// src/constants.ts — helmChartRepositoryUrls 객체에 추가
'open-telemetry.github.io/opentelemetry-helm-charts':
  'https://open-telemetry.github.io/opentelemetry-helm-charts',
'victoriametrics.github.io/helm-charts':
  'https://victoriametrics.github.io/helm-charts',
'grafana.github.io/helm-charts':
  'https://grafana.github.io/helm-charts',
```

- [ ] **Step 2: `common/nexus/src/esc/common.esc.ts` zod 스키마 동일 3키 추가**

- [ ] **Step 3: `k8s-workstation-system.esc.ts`에 grafana 블록 추가**

```typescript
grafana: z
  .object({
    adminPassword: z.string(),
  })
  .required(),
```

- [ ] **Step 4: `.projenrc.ts` k8sWorkstationSystemEsc upsert에 매핑**

```typescript
grafana: {
  adminPassword: process.env.GRAFANA_ADMIN_PASSWORD,
},
```

- [ ] **Step 5: projen 실행 + ESC 동기화**

Run:
```bash
pnpm projen
```
Expected: `common/nexus` 및 ESC 관련 파일 재생성, TypeScript 오류 없음

- [ ] **Step 6: Commit**

```bash
git add src/constants.ts common/nexus/src/esc/common.esc.ts common/nexus/src/esc/k8s-workstation-system.esc.ts .projenrc.ts
git commit -m "chore(esc): add monitoring helm repos and grafana admin password"
```

---

### Task 2: monitoring 모듈 스캐폴딩

**Files:**
- Create: `infra/k8s-workstation-system/src/components/monitoring/index.ts`
- Modify: `infra/k8s-workstation-system/src/components/index.ts`

**Interfaces:**
- Produces: `export * from './monitoring'` via components index

- [ ] **Step 1: `monitoring/index.ts` 생성 (빈 export placeholder)**

```typescript
// infra/k8s-workstation-system/src/components/monitoring/index.ts
export * from './otel-operator.helm-chart.component';
export * from './victoria-metrics.helm-chart.component';
export * from './loki.helm-chart.component';
export * from './tempo.helm-chart.component';
export * from './grafana.authentik.component';
export * from './grafana.helm-chart.component';
export * from './otel.resources.component';
export * from './grafana.service-mesh.component';
```

- [ ] **Step 2: `components/index.ts`에 추가**

```typescript
export * as monitoring from './monitoring';
```

- [ ] **Step 3: Commit**

```bash
git add infra/k8s-workstation-system/src/components/monitoring/index.ts infra/k8s-workstation-system/src/components/index.ts
git commit -m "chore(monitoring): scaffold monitoring component module"
```

---

### Task 3: OpenTelemetry Operator Helm

**Files:**
- Create: `infra/k8s-workstation-system/src/components/monitoring/otel-operator.helm-chart.component.ts`

**Interfaces:**
- Consumes: `args.helm.opentelemetryOperator.{version, repositoryUrl}`, `args.providers.kubernetes`
- Produces:
  - `output.namespace: Output<string>` — `"monitoring"`
  - (Operator CRD 설치 완료 — downstream `dependsOn` 대상)

- [ ] **Step 1: 컴포넌트 구현**

`cert-manager.helm-chart.component.ts` / `postgresql-operator.helm-chart.component.ts` 패턴 따름.

```typescript
/**
 * OpenTelemetry Operator Helm — monitoring NS + CRD/controller
 *
 * cert-manager webhook 연동. downstream Collector/Instrumentation CR의 전제.
 */
import * as utils from '@common/utils/src';
import * as kubernetes from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';

interface OtelOperatorHelmChartComponentArgsShape {
  helm: {
    opentelemetryOperator: {
      version: string;
      repositoryUrl: string;
    };
  };
  providers: {
    kubernetes: kubernetes.Provider;
  };
}

export type OtelOperatorHelmChartComponentArgs =
  utils.types.DeepPulumiInput<OtelOperatorHelmChartComponentArgsShape>;

export const OtelOperatorHelmChartComponent = utils.functions.defineComponent(
  'otelOperatorHelmChart',
  (
    args: OtelOperatorHelmChartComponentArgs,
    opts: pulumi.ComponentResourceOptions,
    resourceName: string,
  ) => {
    const namespace = new kubernetes.core.v1.Namespace(
      `${resourceName}-namespace`,
      { metadata: { name: 'monitoring' } },
      { ...opts, provider: args.providers.kubernetes },
    );

    const release = new kubernetes.helm.v3.Release(
      `${resourceName}-release`,
      {
        name: 'opentelemetry-operator',
        chart: 'opentelemetry-operator',
        version: args.helm.opentelemetryOperator.version,
        namespace: namespace.metadata.name,
        repositoryOpts: { repo: args.helm.opentelemetryOperator.repositoryUrl },
        waitForJobs: true,
        values: {
          admissionWebhooks: {
            certManager: { enabled: true },
          },
          manager: {
            collectorImage: {
              repository:
                'ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-k8s',
            },
            resources: {
              requests: { cpu: '50m', memory: '128Mi' },
              limits: { cpu: '500m', memory: '512Mi' },
            },
          },
        },
      },
      {
        ...opts,
        provider: args.providers.kubernetes,
        dependsOn: [namespace],
      },
    );

    return {
      output: pulumi.output({
        namespace: namespace.metadata.name,
      }),
      secret: pulumi.secret({}),
    };
  },
);
```

- [ ] **Step 2: TypeScript 빌드**

Run:
```bash
pnpm --filter @infra/k8s-workstation-system build
```
Expected: PASS (contract 미배선이면 export만 확인; Task 11에서 contract 배선)

- [ ] **Step 3: Commit**

```bash
git add infra/k8s-workstation-system/src/components/monitoring/otel-operator.helm-chart.component.ts
git commit -m "feat(monitoring): add OpenTelemetry Operator helm component"
```

---

### Task 4: VictoriaMetrics · Loki · Tempo Helm (백엔드)

**Files:**
- Create: `.../victoria-metrics.helm-chart.component.ts`
- Create: `.../loki.helm-chart.component.ts`
- Create: `.../tempo.helm-chart.component.ts`

**Interfaces:**
- Consumes: `args.namespace`, `args.storageClassName` (`longhorn-ssd`), helm version/repo
- Produces (각 컴포넌트):
  - VictoriaMetrics: `output.services.victoriaMetrics.{name, port}` — release name `victoria-metrics-single`, port `8428`
  - Loki: `output.services.loki.{name, port}` — gateway 또는 single binary service, port `3100`
  - Tempo: `output.services.tempo.{name, port}` — release `tempo`, port `3200` (query), OTLP `4317`

- [ ] **Step 1: VictoriaMetrics single**

```typescript
// chart: victoria-metrics-single, release name: victoria-metrics
values: {
  server: {
    retentionPeriod: '15d',
    persistentVolume: {
      enabled: true,
      storageClass: args.storageClassName,
      size: '20Gi',
    },
    resources: {
      requests: { cpu: '100m', memory: '256Mi' },
      limits: { cpu: '1000m', memory: '1Gi' },
    },
  },
}
```

Service output: `{ name: 'victoria-metrics-victoria-metrics-single', port: { http: 8428 } }` — Helm 설치 후 실제 Service 이름은 `pulumi preview`로 확인하고 output에 맞게 수정.

- [ ] **Step 2: Loki SingleBinary + PVC**

```typescript
// chart: loki, release name: loki
values: {
  deploymentMode: 'SingleBinary',
  loki: {
    auth_enabled: false,
    commonConfig: {
      replication_factor: 1,
    },
    storage: {
      type: 'filesystem',
    },
    limits_config: {
      retention_period: '168h', // 7d
    },
  },
  singleBinary: {
    persistence: {
      enabled: true,
      storageClass: args.storageClassName,
      size: '20Gi',
    },
    resources: {
      requests: { cpu: '100m', memory: '256Mi' },
      limits: { cpu: '1000m', memory: '1Gi' },
    },
  },
  gateway: { enabled: false },
  read: { replicas: 0 },
  write: { replicas: 0 },
  backend: { replicas: 0 },
}
```

Service output: `{ name: 'loki', port: { http: 3100 } }`

- [ ] **Step 3: Tempo single + PVC**

```typescript
// chart: tempo, release name: tempo
values: {
  tempo: {
    retention: '72h', // 3d
    storage: {
      trace: {
        backend: 'local',
        local: {
          path: '/var/tempo/traces',
        },
      },
    },
  },
  persistence: {
    enabled: true,
    storageClassName: args.storageClassName,
    size: '10Gi',
  },
  resources: {
    requests: { cpu: '100m', memory: '256Mi' },
    limits: { cpu: '1000m', memory: '1Gi' },
  },
}
```

Service output:
```typescript
services: {
  tempo: {
    name: 'tempo',
    port: {
      query: 3200,
      otlpGrpc: 4317,
      otlpHttp: 4318,
    },
  },
}
```

- [ ] **Step 4: 빌드**

Run: `pnpm --filter @infra/k8s-workstation-system build`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add infra/k8s-workstation-system/src/components/monitoring/victoria-metrics.helm-chart.component.ts \
        infra/k8s-workstation-system/src/components/monitoring/loki.helm-chart.component.ts \
        infra/k8s-workstation-system/src/components/monitoring/tempo.helm-chart.component.ts
git commit -m "feat(monitoring): add VictoriaMetrics, Loki, Tempo helm components"
```

---

### Task 5: Grafana Authentik OIDC

**Files:**
- Create: `infra/k8s-workstation-system/src/components/monitoring/grafana.authentik.component.ts`

**Interfaces:**
- Consumes: `args.hosts.{grafana, authentik}`, `args.authentik.{allowedGroupId, flow}`, `args.providers.authentik`
- Produces:
  - `output.oidc: { name, issuerUrl, groupsClaim, requestedScopes, roleAttributePath }`
  - `secret.oidc: { clientId, clientSecret }`

- [ ] **Step 1: Argo 패턴 복제 후 Grafana용 상수 적용**

```typescript
const grafanaApplicationSlug = 'grafana';
const grafanaOidcClientId = 'grafana';
const grafanaOidcGroupsClaim = 'grafana_groups';
const grafanaOidcGroupsScopeName = 'grafana_groups';

// PropertyMappingProviderScope expression:
// return { "grafana_groups": sorted({group.name for group in request.user.ak_groups.all()}) };

// ProviderOauth2 allowedRedirectUris:
// url: pulumi.interpolate`https://${args.hosts.grafana}/login/generic_oauth`

// Application slug: grafana, metaLaunchUrl: https://${grafana}/

// PolicyBinding group: args.authentik.allowedGroupId

// output.roleAttributePath (Grafana generic_oauth):
// "contains(grafana_groups[*], 'System Manager') && 'Admin' || 'Viewer'"
```

- [ ] **Step 2: return shape**

```typescript
return {
  output: pulumi.output({
    oidc: {
      name: 'Authentik',
      issuerUrl: pulumi.interpolate`https://${args.hosts.authentik}/application/o/${grafanaApplicationSlug}/`,
      groupsClaim: grafanaOidcGroupsClaim,
      requestedScopes: ['openid', 'profile', 'email', grafanaOidcGroupsScopeName],
      roleAttributePath:
        "contains(grafana_groups[*], 'System Manager') && 'Admin' || 'Viewer'",
    },
  }),
  secret: pulumi.secret({
    oidc: {
      clientId: grafanaOauth2Provider.clientId,
      clientSecret: grafanaOauth2Provider.clientSecret,
    },
  }),
};
```

- [ ] **Step 3: 빌드 + Commit**

```bash
pnpm --filter @infra/k8s-workstation-system build
git add infra/k8s-workstation-system/src/components/monitoring/grafana.authentik.component.ts
git commit -m "feat(monitoring): add Grafana Authentik OIDC component"
```

---

### Task 6: Grafana Helm (Datasources + OIDC)

**Files:**
- Create: `infra/k8s-workstation-system/src/components/monitoring/grafana.helm-chart.component.ts`

**Interfaces:**
- Consumes:
  - `args.namespace`, `args.host`, `args.adminPassword`
  - `args.datasources.{victoriaMetrics, loki, tempo}` — `{ url }` each
  - `args.oidc` — from `grafanaAuthentik.output` + `secret`
- Produces:
  - `output.services.grafana.{name, port}` — `{ name: '<release>-grafana', port: { http: 80 } }`

- [ ] **Step 1: Helm values 핵심**

```typescript
values: {
  ingress: { enabled: false },
  'grafana.ini': {
    server: {
      root_url: pulumi.interpolate`https://${args.host}/`,
      domain: args.host,
    },
    'auth.anonymous': { enabled: false },
    'auth.generic_oauth': {
      enabled: true,
      name: args.oidc.name,
      allow_sign_up: true,
      client_id: args.oidc.clientId,
      client_secret: args.oidc.clientSecret,
      scopes: args.oidc.requestedScopes.join(' '),
      auth_url: pulumi.interpolate`${args.oidc.issuerUrl}authorize/`,
      token_url: pulumi.interpolate`${args.oidc.issuerUrl}token/`,
      api_url: pulumi.interpolate`${args.oidc.issuerUrl}userinfo/`,
      role_attribute_path: args.oidc.roleAttributePath,
      role_attribute_strict: true,
    },
  },
  adminUser: 'admin',
  adminPassword: args.adminPassword,
  datasources: {
    'datasources.yaml': {
      apiVersion: 1,
      datasources: [
        {
          name: 'VictoriaMetrics',
          type: 'prometheus',
          uid: 'VictoriaMetrics',
          url: args.datasources.victoriaMetrics.url,
          access: 'proxy',
          isDefault: true,
        },
        {
          name: 'Loki',
          type: 'loki',
          uid: 'Loki',
          url: args.datasources.loki.url,
          access: 'proxy',
        },
        {
          name: 'Tempo',
          type: 'tempo',
          uid: 'Tempo',
          url: args.datasources.tempo.url,
          access: 'proxy',
          jsonData: {
            tracesToLogsV2: {
              datasourceUid: 'Loki',
            },
          },
        },
      ],
    },
  },
  persistence: {
    enabled: true,
    storageClassName: args.storageClassName,
    size: '5Gi',
  },
  resources: {
    requests: { cpu: '100m', memory: '256Mi' },
    limits: { cpu: '500m', memory: '512Mi' },
  },
}
```

Datasource URL 예 (contract에서 interpolate):
- VM: `http://victoria-metrics-victoria-metrics-single.monitoring.svc.cluster.local:8428`
- Loki: `http://loki.monitoring.svc.cluster.local:3100`
- Tempo: `http://tempo.monitoring.svc.cluster.local:3200`

- [ ] **Step 2: 빌드 + Commit**

```bash
pnpm --filter @infra/k8s-workstation-system build
git add infra/k8s-workstation-system/src/components/monitoring/grafana.helm-chart.component.ts
git commit -m "feat(monitoring): add Grafana helm with datasources and OIDC"
```

---

### Task 7: OpenTelemetry Collector · Instrumentation CR

**Files:**
- Create: `infra/k8s-workstation-system/src/components/monitoring/otel.resources.component.ts`

**Interfaces:**
- Consumes:
  - `args.namespace`
  - `args.backends.{victoriaMetrics, loki, tempo}` — internal URLs/ports
  - `args.providers.kubernetes`
- Produces:
  - `output.collector.name: 'central-collector'`
  - `output.instrumentation.name: 'central-instrumentation'`

- [ ] **Step 1: OpenTelemetryCollector CustomResource**

```typescript
import * as kubernetes from '@pulumi/kubernetes';

const collector = new kubernetes.apiextensions.CustomResource(
  `${resourceName}-centralCollector`,
  {
    apiVersion: 'opentelemetry.io/v1beta1',
    kind: 'OpenTelemetryCollector',
    metadata: {
      name: 'central-collector',
      namespace: args.namespace,
    },
    spec: {
      mode: 'daemonset',
      serviceAccount: 'central-collector',
      config: yaml.stringify({
        receivers: {
          otlp: {
            protocols: { grpc: {}, http: {} },
          },
          filelog: {
            include: ['/var/log/pods/*/*/*.log'],
            exclude: [],
            start_at: 'end',
            include_file_path: true,
            include_file_name: false,
            operators: [
              { type: 'container' },
            ],
          },
          kubeletstats: {
            collection_interval: '30s',
            auth_type: 'serviceAccount',
            endpoint: 'https://${env:K8S_NODE_IP}:10250',
            insecure_skip_verify: true,
          },
        },
        processors: {
          memory_limiter: {
            check_interval: '1s',
            limit_percentage: 75,
            spike_limit_percentage: 15,
          },
          k8sattributes: {},
          resource: {},
          batch: {},
        },
        exporters: {
          prometheusremotewrite: {
            endpoint: args.backends.victoriaMetrics.remoteWriteUrl,
          },
          otlphttp: {
            logs: {
              endpoint: args.backends.loki.otlpHttpUrl,
            },
          },
          otlp: {
            traces: {
              endpoint: args.backends.tempo.otlpGrpcEndpoint,
              tls: { insecure: true },
            },
          },
        },
        service: {
          pipelines: {
            metrics: {
              receivers: ['otlp', 'kubeletstats'],
              processors: ['memory_limiter', 'k8sattributes', 'resource', 'batch'],
              exporters: ['prometheusremotewrite'],
            },
            logs: {
              receivers: ['otlp', 'filelog'],
              processors: ['memory_limiter', 'k8sattributes', 'resource', 'batch'],
              exporters: ['otlphttp/logs'],
            },
            traces: {
              receivers: ['otlp'],
              processors: ['memory_limiter', 'k8sattributes', 'resource', 'batch'],
              exporters: ['otlp/traces'],
            },
          },
        },
      }),
    },
  },
  { ...opts, provider: args.providers.kubernetes },
);
```

**Note:** Loki OTLP ingest는 Loki 3.x + `-otlp` 설정 필요. Loki Helm values에 `loki.limits_config` 외 `distributor` OTLP 활성화 확인. 구현 시 Loki chart values에 `loki.pattern_ingester` / OTLP receiver 설정 추가:

```typescript
// loki.helm-chart.component.ts 보완
loki: {
  ...
  distributor: {
    otlp: {
      enabled: true,
    },
  },
},
```

VictoriaMetrics remote write URL: `http://victoria-metrics-victoria-metrics-single.monitoring.svc:8428/api/v1/write`

- [ ] **Step 2: ClusterRole for DaemonSet collector (filelog + kubeletstats)**

`otel.resources.component.ts`에 ServiceAccount + ClusterRole + ClusterRoleBinding 추가 (kubelet stats / pod log 읽기).

- [ ] **Step 3: Instrumentation CR**

```typescript
const instrumentation = new kubernetes.apiextensions.CustomResource(
  `${resourceName}-centralInstrumentation`,
  {
    apiVersion: 'opentelemetry.io/v1alpha1',
    kind: 'Instrumentation',
    metadata: {
      name: 'central-instrumentation',
      namespace: args.namespace,
    },
    spec: {
      exporter: {
        endpoint: pulumi.interpolate`http://central-collector-collector.${args.namespace}.svc.cluster.local:4317`,
      },
      propagators: ['tracecontext', 'baggage'],
      sampler: { type: 'parentbased_traceidratio', argument: '1' },
    },
  },
  { ...opts, provider: args.providers.kubernetes, dependsOn: [collector] },
);
```

Collector Service DNS는 Operator naming convention(`<metadata.name>-collector`) — `pulumi preview` 후 실제 Service명 output에 반영.

- [ ] **Step 4: Commit**

```bash
git add infra/k8s-workstation-system/src/components/monitoring/otel.resources.component.ts
git commit -m "feat(monitoring): add OTel Collector daemonset and central Instrumentation"
```

Loki OTLP 변경이 Task 4 파일에 포함되면 함께 amend 또는 추가 commit.

---

### Task 8: Grafana Service Mesh

**Files:**
- Create: `infra/k8s-workstation-system/src/components/monitoring/grafana.service-mesh.component.ts`

**Interfaces:**
- Consumes: `args.namespace`, `args.ingress.grafana.{host, serviceName, gatewayPath, port}`, `args.providers.kubernetes`
- Produces: (output 없음 — VirtualService만)

- [ ] **Step 1: VirtualService (Argo 패턴)**

```typescript
new customResources.resources.k8s.crd.istio.VirtualServiceV1(
  `${resourceName}-grafanaVirtualService`,
  {
    metadata: {
      name: 'grafana',
      namespace: args.namespace,
    },
    spec: {
      hosts: [args.ingress.grafana.host],
      gateways: [args.ingress.grafana.gatewayPath],
      http: [
        {
          route: [
            {
              destination: {
                host: args.ingress.grafana.serviceName,
                port: { number: args.ingress.grafana.port },
              },
            },
          ],
        },
      ],
    },
  },
  { ...opts, provider: args.providers.kubernetes },
);
```

- [ ] **Step 2: Commit**

```bash
git add infra/k8s-workstation-system/src/components/monitoring/grafana.service-mesh.component.ts
git commit -m "feat(monitoring): expose Grafana via Istio VirtualService"
```

---

### Task 9: contract.ts 배선

**Files:**
- Modify: `infra/k8s-workstation-system/src/contract.ts`
- Modify: `infra/k8s-workstation-system/README.md`

**Interfaces:**
- Consumes: `certManagerHelmChart`, `longhornResources.output.storageClasses.longhornSsd`, `authentikResources`, `authentikProvider`, `istioGateway`, `cloudflareContract.output.zones.ayteneve93com.records.grafana`, `projectEsc.esc.grafana.adminPassword`, common ESC helm URLs

- [ ] **Step 1: contract.ts monitoring 블록 추가 (Argo 블록 아래 권장)**

```typescript
// Monitoring stack
const otelOperatorHelmChart =
  new components.monitoring.OtelOperatorHelmChartComponent(
    'otelOperatorHelmChart',
    {
      helm: {
        opentelemetryOperator: {
          version: '0.120.2',
          repositoryUrl:
            commonEsc.esc.helmRepositoryUrls[
              'open-telemetry.github.io/opentelemetry-helm-charts'
            ],
        },
      },
      providers: { kubernetes: workstationK8sProvider },
    },
    { dependsOn: [certManagerHelmChart] },
  );

const monitoringNamespace = otelOperatorHelmChart.output.namespace;
const monitoringStorageClass =
  longhornResources.output.storageClasses.longhornSsd;

const victoriaMetricsHelmChart =
  new components.monitoring.VictoriaMetricsHelmChartComponent(
    'victoriaMetricsHelmChart',
    {
      namespace: monitoringNamespace,
      storageClassName: monitoringStorageClass,
      helm: {
        victoriaMetrics: {
          version: '0.44.0',
          repositoryUrl:
            commonEsc.esc.helmRepositoryUrls[
              'victoriametrics.github.io/helm-charts'
            ],
        },
      },
      providers: { kubernetes: workstationK8sProvider },
    },
    { dependsOn: [otelOperatorHelmChart, longhornResources] },
  );

// lokiHelmChart, tempoHelmChart — 동일 패턴, dependsOn 병렬

const grafanaHost =
  cloudflareContract.output.zones.ayteneve93com.records.grafana;

const grafanaAuthentik =
  new components.monitoring.GrafanaAuthentikComponent(
    'grafanaAuthentik',
    {
      hosts: {
        grafana: grafanaHost,
        authentik: cloudflareContract.output.zones.ayteneve93com.records.auth,
      },
      authentik: {
        allowedGroupId: authentikResources.output.groupIds.systemUserGroup,
        flow: {
          authorizationFlowId:
            authentikResources.output.flow
              .defaultProviderAuthorizationImplicitConsentId,
          invalidationFlowId:
            authentikResources.output.flow.defaultInvalidationFlowId,
        },
      },
      providers: { authentik: authentikProvider },
    },
    { dependsOn: [authentikResources, authentikProvider] },
  );

const grafanaHelmChart =
  new components.monitoring.GrafanaHelmChartComponent(
    'grafanaHelmChart',
    {
      namespace: monitoringNamespace,
      host: grafanaHost,
      storageClassName: monitoringStorageClass,
      adminPassword: projectEsc.esc.grafana.adminPassword,
      oidc: {
        name: grafanaAuthentik.output.oidc.name,
        issuerUrl: grafanaAuthentik.output.oidc.issuerUrl,
        groupsClaim: grafanaAuthentik.output.oidc.groupsClaim,
        requestedScopes: grafanaAuthentik.output.oidc.requestedScopes,
        roleAttributePath: grafanaAuthentik.output.oidc.roleAttributePath,
        clientId: grafanaAuthentik.secret.oidc.clientId,
        clientSecret: grafanaAuthentik.secret.oidc.clientSecret,
      },
      datasources: {
        victoriaMetrics: {
          url: pulumi.interpolate`http://${victoriaMetricsHelmChart.output.services.victoriaMetrics.name}.${monitoringNamespace}.svc.cluster.local:${victoriaMetricsHelmChart.output.services.victoriaMetrics.port.http}`,
        },
        // loki, tempo 동일
      },
      helm: {
        grafana: {
          version: '10.5.15',
          repositoryUrl:
            commonEsc.esc.helmRepositoryUrls['grafana.github.io/helm-charts'],
        },
      },
      providers: { kubernetes: workstationK8sProvider },
    },
    {
      dependsOn: [
        grafanaAuthentik,
        victoriaMetricsHelmChart,
        // loki, tempo
      ],
    },
  );

new components.monitoring.OtelResourcesComponent(
  'otelResources',
  {
    namespace: monitoringNamespace,
    backends: {
      victoriaMetrics: {
        remoteWriteUrl: pulumi.interpolate`http://${victoriaMetricsHelmChart.output.services.victoriaMetrics.name}.${monitoringNamespace}.svc.cluster.local:${victoriaMetricsHelmChart.output.services.victoriaMetrics.port.http}/api/v1/write`,
      },
      loki: {
        otlpHttpUrl: pulumi.interpolate`http://${lokiHelmChart.output.services.loki.name}.${monitoringNamespace}.svc.cluster.local:${lokiHelmChart.output.services.loki.port.http}/otlp`,
      },
      tempo: {
        otlpGrpcEndpoint: pulumi.interpolate`${lokiHelmChart.output.services.tempo.name}.${monitoringNamespace}.svc.cluster.local:${tempoHelmChart.output.services.tempo.port.otlpGrpc}`,
      },
    },
    providers: { kubernetes: workstationK8sProvider },
  },
  {
    dependsOn: [
      otelOperatorHelmChart,
      victoriaMetricsHelmChart,
      lokiHelmChart,
      tempoHelmChart,
    ],
  },
);

new components.monitoring.GrafanaServiceMeshComponent(
  'grafanaServiceMesh',
  {
    namespace: monitoringNamespace,
    ingress: {
      grafana: {
        host: grafanaHost,
        serviceName: grafanaHelmChart.output.services.grafana.name,
        gatewayPath: istioGateway.output.istioIngressGatewayPath,
        port: grafanaHelmChart.output.services.grafana.port.http,
      },
    },
    providers: { kubernetes: workstationK8sProvider },
  },
  { dependsOn: [grafanaHelmChart, istioGateway] },
);
```

**Fix typo in plan:** tempo otlp endpoint must use `tempoHelmChart`, not `lokiHelmChart`.

- [ ] **Step 2: README 배포 순서·컴포넌트 표 갱신**

monitoring 행 추가, 배포 순서에 `→ monitoring (OTel stack)` 추가.

- [ ] **Step 3: 빌드**

Run:
```bash
pnpm --filter @infra/k8s-workstation-system build
```
Expected: PASS, TypeScript 오류 없음

- [ ] **Step 4: Commit**

```bash
git add infra/k8s-workstation-system/src/contract.ts infra/k8s-workstation-system/README.md
git commit -m "feat(monitoring): wire monitoring stack in k8s-workstation-system contract"
```

---

### Task 10: Preview · Cluster 검증

**Files:** (none — 검증 only)

- [ ] **Step 1: Pulumi preview**

Run:
```bash
pnpm --filter @infra/k8s-workstation-system pulumi:preview
```
Expected: monitoring NS, 5 Helm releases, 2 CustomResources(OTel), 1 VirtualService, Authentik Application/Provider create/update. Unexpected replace/delete 없는지 확인.

- [ ] **Step 2: (선택) pulumi up 후 Kubernetes MCP로 검증**

```text
monitoring namespace pods: opentelemetry-operator, victoria-metrics, loki, tempo, grafana, central-collector (DaemonSet)
Grafana VirtualService host = records.grafana FQDN
```

- [ ] **Step 3: Grafana OIDC smoke test**

1. `https://grafana.<zone>` 접속 → Authentik redirect
2. `System User` 로그인 → Viewer (설정 변경 불가)
3. `System Manager` 로그인 → Admin
4. Datasources 3개 default 연결 확인

- [ ] **Step 4: Instrumentation annotation smoke test**

테스트 Pod에 annotation:
```yaml
instrumentation.opentelemetry.io/inject-sdk: monitoring/central-instrumentation
```
→ Tempo/Loki/VM에 데이터 유입 확인 (Grafana Explore)

- [ ] **Step 5: Final commit (if preview-driven fixes)**

```bash
git commit -m "fix(monitoring): reconcile helm service names from preview"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|---|---|
| monitoring Namespace | Task 3 |
| OTel Operator + cert-manager | Task 3 |
| VictoriaMetrics / Loki / Tempo + Longhorn PVC | Task 4 |
| Grafana + datasource provisioning | Task 6 |
| OpenTelemetryCollector daemonset | Task 7 |
| central Instrumentation | Task 7 |
| Authentik OIDC + systemUser bind | Task 5 |
| Viewer/Admin role mapping | Task 5, 6 |
| Grafana VirtualService only external | Task 8 |
| GRAFANA_ADMIN_PASSWORD ESC | Task 1 |
| contract.ts wiring | Task 9 |
| Success criteria verification | Task 10 |

## Plan Self-Review Notes

- Tempo OTLP endpoint typo in Task 9 snippet corrected at implementation time (`tempoHelmChart`).
- Loki OTLP ingest requires chart values update in Task 4/7 — explicitly called out.
- Collector Service DNS naming depends on Operator convention — verify in Task 10 preview and fix outputs.
- No unit tests in this repo; verification is `build` + `pulumi preview` + optional cluster smoke tests.
