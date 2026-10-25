# Nova Diagnosis Report

Generated at ```2026-10-23T13:36:40.279Z```

## Context: ```ws```

### Outdated or Deprecated Helm Releases

| Release | Chart | Namespace | Installed Version | Latest Version | Outdated | Deprecated |
| ------- | ----- | --------- | ----------------- | -------------- | -------- | ---------- |
| argo-cd | argo-cd | argo-cd | 10.10.5 (app: v3.5.5) | 10.11.0 (app: v3.5.5) | Yes | No |
| authentik | authentik | authentik | 2026.8.4 (app: 2026.8.4) | 2026.8.5 (app: 2026.8.5) | Yes | No |
| istio-base | base | istio-system | 1.30.6 (app: 1.30.6) | 1.30.7 (app: 1.30.7) | Yes | No |
| istio-cni | cni | istio-system | 1.30.6 (app: 1.30.6) | 1.30.7 (app: 1.30.7) | Yes | No |
| istio-ingressgateway | gateway | istio-system | 1.30.6 (app: 1.30.6) | 1.30.7 (app: 1.30.7) | Yes | No |
| istiod | istiod | istio-system | 1.30.6 (app: 1.30.6) | 1.30.7 (app: 1.30.7) | Yes | No |
| ztunnel | ztunnel | istio-system | 1.30.6 (app: 1.30.6) | 1.30.7 (app: 1.30.7) | Yes | No |
| jellyfin | jellyfin | jellyfin | 3.2.0 (app: 10.11.8) | 3.6.0 (app: 12.3) | Yes | No |
| cilium | cilium | kube-system | 1.20.2 (app: 1.20.2) | 1.21.0-pre.3 (app: 1.21.0-pre.3) | Yes | No |
| loki | loki | monitoring | 19.0.0 (app: 3.7.8) | 19.1.1 (app: 3.7.9) | Yes | No |
| opentelemetry-operator | opentelemetry-operator | monitoring | 0.126.1 (app: 0.161.0) | 0.126.2 (app: 0.161.0) | Yes | No |
| tempo | tempo | monitoring | 3.2.0 (app: 3.1.0) | 3.2.1 (app: 3.1.1) | Yes | No |
| vault-secrets-operator | vault-secrets-operator | vault-secrets-operator | 1.6.0 (app: 1.6.0) | 1.6.2 (app: 1.6.2) | Yes | No |

### Outdated Container Images

| Image | Current Version | Latest Version | Latest Minor | Latest Patch |
| ----- | --------------- | -------------- | ------------ | ------------ |
| registry.k8s.io/dns/k8s-dns-node-cache | 1.25.0 | 1.27.1 | 1.27.1 | 1.25.0 |
| registry.k8s.io/cpa/cluster-proportional-autoscaler | v1.10.3 | v1.11.0 | v1.11.0 | v1.10.3 |
| registry.k8s.io/nfd/node-feature-discovery | v0.19.0 | v0.20.1 | v0.19.0 | v0.19.0 |
| registry.k8s.io/autoscaling/vpa-recommender | 1.7.1 | 1.8.1 | 1.8.1 | 1.7.3 |
| registry.k8s.io/coredns/coredns | v1.12.4 | v1.14.7 | v1.14.7 | v1.12.4 |
| registry.k8s.io/kube-apiserver | v1.35.9 | v1.37.1 | v1.37.1 | v1.35.9 |
| registry.k8s.io/kube-scheduler | v1.35.9 | v1.37.1 | v1.37.1 | v1.35.9 |
| ghcr.io/goauthentik/proxy | 2026.8.4 | 2026.8.5 | 2026.8.5 | 2026.8.5 |
| ghcr.io/kube-vip/kube-vip | v1.0.3 | v1.3.1 | v1.3.1 | v1.0.4 |
| ghcr.io/goauthentik/server | 2026.8.4 | 2026.8.5 | 2026.8.5 | 2026.8.5 |
| registry.k8s.io/kube-controller-manager | v1.35.9 | v1.37.1 | v1.37.1 | v1.35.9 |
| quay.io/opstree/redis | v7.0.15 | v8.10.1 | v7.4.11 | v7.0.15 |
| hashicorp/vault | 2.0.3 | 2.2.1 | 2.2.1 | 2.0.4 |
| ghcr.io/dexidp/dex | v2.46.0 | v2.46.1 | v2.46.1 | v2.46.1 |
| docker.io/longhornio/csi-resizer | v2.2.1 | v2.3.0 | v2.3.0 | v2.2.1 |
| docker.io/prom/memcached-exporter | v0.17.0 | v0.18.0 | v0.17.0 | v0.17.0 |
| hashicorp/vault | 2.0.4 | 2.2.1 | 2.2.1 | 2.0.4 |
| docker.io/longhornio/csi-snapshotter | v8.6.0 | v8.7.0 | v8.7.0 | v8.6.0 |
| hashicorp/vault-secrets-operator | 1.6.0 | 1.6.2 | 1.6.2 | 1.6.2 |
| docker.io/alpine/k8s | 1.35.4 | 1.37.1 | 1.37.1 | 1.35.9 |
| victoriametrics/victoria-metrics | v1.154.0 | v1.154.1 | v1.154.1 | v1.154.1 |
| registry.istio.io/release/ztunnel | 1.30.6-distroless | 1.30.7-distroless | 1.30.7-distroless | 1.30.7-distroless |
| ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib | 0.156.0 | 0.163.2 | 0.156.0 | 0.156.0 |
| registry.istio.io/release/install-cni | 1.30.6-distroless | 1.30.7-distroless | 1.30.7-distroless | 1.30.7-distroless |
| registry.istio.io/release/proxyv2 | 1.30.6-distroless | 1.30.7-distroless | 1.30.7-distroless | 1.30.7-distroless |
| registry.istio.io/release/pilot | 1.30.6-distroless | 1.30.7-distroless | 1.30.7-distroless | 1.30.7-distroless |
| registry.istio.io/release/proxyv2 | 1.30.4-distroless | 1.30.7-distroless | 1.30.7-distroless | 1.30.7-distroless |
| quay.io/brancz/kube-rbac-proxy | v0.18.1 | v0.23.0 | v0.18.1 | v0.18.2 |
