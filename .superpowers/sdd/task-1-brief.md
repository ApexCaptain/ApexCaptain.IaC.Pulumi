# Task 1: ESC · Helm Repository 기반

**Files:**
- Modify: `src/constants.ts`
- Modify: `common/nexus/src/esc/common.esc.ts`
- Modify: `common/nexus/src/esc/k8s-workstation-system.esc.ts`
- Modify: `.projenrc.ts`

**Interfaces:**
- Consumes: `process.env.GRAFANA_ADMIN_PASSWORD`
- Produces: `commonEsc.esc.helmRepositoryUrls['open-telemetry.github.io/opentelemetry-helm-charts']`, `['victoriametrics.github.io/helm-charts']`, `['grafana.github.io/helm-charts']`; `projectEsc.esc.grafana.adminPassword`

## Step 1: `src/constants.ts`에 repo URL 추가

```typescript
'open-telemetry.github.io/opentelemetry-helm-charts':
  'https://open-telemetry.github.io/opentelemetry-helm-charts',
'victoriametrics.github.io/helm-charts':
  'https://victoriametrics.github.io/helm-charts',
'grafana.github.io/helm-charts':
  'https://grafana.github.io/helm-charts',
```

## Step 2: `common/nexus/src/esc/common.esc.ts` zod 스키마 동일 3키 추가

## Step 3: `k8s-workstation-system.esc.ts`에 grafana 블록 추가

```typescript
grafana: z
  .object({
    adminPassword: z.string(),
  })
  .required(),
```

## Step 4: `.projenrc.ts` k8sWorkstationSystemEsc upsert에 매핑

```typescript
grafana: {
  adminPassword: process.env.GRAFANA_ADMIN_PASSWORD,
},
```

## Step 5: projen 실행

```bash
pnpm projen
```

## Step 6: Commit

```bash
git add src/constants.ts common/nexus/src/esc/common.esc.ts common/nexus/src/esc/k8s-workstation-system.esc.ts .projenrc.ts
git commit -m "chore(esc): add monitoring helm repos and grafana admin password"
```
