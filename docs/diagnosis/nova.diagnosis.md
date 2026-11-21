# Nova Diagnosis Report

Generated at ```2026-11-21```

## Context: ```ws```

### Outdated or Deprecated Helm Releases

| Release | Chart | Namespace | Installed Version | Latest Version | Outdated | Deprecated |
| ------- | ----- | --------- | ----------------- | -------------- | -------- | ---------- |
| argo-cd | argo-cd | argo-cd | 10.18.0 (app: v3.6.1) | 10.18.2 (app: v3.6.2) | Yes | No |
| authentik | authentik | authentik | 2026.8.5 (app: 2026.8.5) | 2026.8.6 (app: 2026.8.6) | Yes | No |
| coder | coder | coder | 2.39.1 (app: 2.39.1) | 2.39.4 (app: 2.39.4) | Yes | No |
| goldilocks | goldilocks | goldilocks | 11.2.1 (app: v4.16.3) | 11.3.1 (app: v4.16.3) | Yes | No |
| gpu-operator | gpu-operator | gpu-operator | v26.7.2 (app: v26.7.2) | v26.7.3 (app: v26.7.3) | Yes | No |
| jellyfin | jellyfin | jellyfin | 3.2.0 (app: 10.11.8) | 3.7.0 (app: 12.4) | Yes | No |
| cilium | cilium | kube-system | 1.20.3 (app: 1.20.3) | 1.21.0-pre.4 (app: 1.21.0-pre.4) | Yes | No |
| grafana | grafana | monitoring | 14.4.1 (app: 13.3.1) | 14.5.0 (app: 13.3.1) | Yes | No |
| loki | loki | monitoring | 21.2.1 (app: 3.7.9) | 21.4.3 (app: 3.7.10) | Yes | No |
| opentelemetry-operator | opentelemetry-operator | monitoring | 0.129.0 (app: 0.162.0) | 0.129.1 (app: 0.162.0) | Yes | No |
| postgresql-operator | cloudnative-pg | postgresql-operator | 0.29.1 (app: 1.30.1) | 0.29.2 (app: 1.30.2) | Yes | No |
| vault-secrets-operator | vault-secrets-operator | vault-secrets-operator | 1.6.2 (app: 1.6.2) | 2.0.0 (app: 2.0.0) | Yes | No |

### Outdated Container Images

| Image | Current Version | Latest Version | Latest Minor | Latest Patch |
| ----- | --------------- | -------------- | ------------ | ------------ |
| ghcr.io/kube-vip/kube-vip | v1.0.3 | v1.3.2 | v1.3.2 | v1.0.4 |
| ghcr.io/open-telemetry/opentelemetry-operator/opentelemetry-operator | 0.162.0 | 0.163.0 | 0.162.0 | 0.162.0 |
| ghcr.io/cloudnative-pg/cloudnative-pg | 1.30.1 | 1.30.2 | 1.30.2 | 1.30.2 |
| ghcr.io/goauthentik/proxy | 2026.8.5 | 2026.8.6 | 2026.8.6 | 2026.8.6 |
| ghcr.io/goauthentik/server | 2026.8.5 | 2026.8.6 | 2026.8.6 | 2026.8.6 |
| registry.k8s.io/metrics-server/metrics-server | v0.9.0 | v0.9.1 | v0.9.0 | v0.9.1 |
| registry.k8s.io/cpa/cluster-proportional-autoscaler | v1.10.3 | v1.11.0 | v1.11.0 | v1.10.3 |
| registry.k8s.io/autoscaling/vpa-recommender | 1.7.1 | 1.8.1 | 1.8.1 | 1.7.3 |
| registry.k8s.io/coredns/coredns | v1.14.2 | v1.15.0 | v1.15.0 | v1.14.7 |
| registry.k8s.io/dns/k8s-dns-node-cache | 1.25.0 | 1.27.1 | 1.27.1 | 1.25.0 |
| registry.k8s.io/nfd/node-feature-discovery | v0.19.0 | v0.20.1 | v0.19.0 | v0.19.0 |
| ghcr.io/coder/coder | v2.39.1 | v2.39.4 | v2.39.4 | v2.39.4 |
| registry.k8s.io/kube-apiserver | v1.36.5 | v1.37.2 | v1.37.2 | v1.36.6 |
| registry.k8s.io/kube-controller-manager | v1.36.5 | v1.37.2 | v1.37.2 | v1.36.6 |
| registry.k8s.io/kube-scheduler | v1.36.5 | v1.37.2 | v1.37.2 | v1.36.6 |
| us-docker.pkg.dev/fairwinds-ops/oss/goldilocks | v4.16.3 | v4.16.4 | v4.16.4 | v4.16.4 |
| ghcr.io/stakater/reloader | v1.4.24 | v1.4.25 | v1.4.25 | v1.4.25 |
| quay.io/opstree/redis | v7.0.15 | v8.10.1 | v7.4.11 | v7.0.15 |
| docker.io/longhornio/csi-resizer | v2.2.1 | v2.3.0 | v2.3.0 | v2.2.1 |
| registry.istio.io/release/proxyv2 | 1.30.4-distroless | 1.30.8-distroless | 1.30.8-distroless | 1.30.8-distroless |
| hashicorp/vault | 2.0.4 | 2.2.2 | 2.2.2 | 2.0.4 |
| docker.io/alpine/k8s | 1.35.4 | 1.37.2 | 1.37.2 | 1.35.10 |
| hashicorp/vault-secrets-operator | 1.6.2 | 2.0.0 | 1.6.2 | 1.6.2 |
| hashicorp/vault | 2.0.3 | 2.2.2 | 2.2.2 | 2.0.4 |
| docker.io/longhornio/csi-snapshotter | v8.6.0 | v8.7.0 | v8.7.0 | v8.6.0 |
| nvcr.io/nvidia/gpu-operator | v26.7.2 | v26.7.3 | v26.7.3 | v26.7.3 |
| nvcr.io/nvidia/k8s-device-plugin | v0.20.1 | v0.20.2 | v0.20.1 | v0.20.2 |
| ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib | 0.156.0 | 0.165.0 | 0.156.0 | 0.156.0 |
| quay.io/brancz/kube-rbac-proxy | v0.18.1 | v0.23.1 | v0.18.1 | v0.18.2 |
