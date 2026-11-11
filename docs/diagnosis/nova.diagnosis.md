# Nova Diagnosis Report

Generated at ```2026-11-11```

## Context: ```ws```

### Outdated or Deprecated Helm Releases

| Release | Chart | Namespace | Installed Version | Latest Version | Outdated | Deprecated |
| ------- | ----- | --------- | ----------------- | -------------- | -------- | ---------- |
| argo-cd | argo-cd | argo-cd | 10.14.0 (app: v3.6.1) | 10.17.1 (app: v3.6.1) | Yes | No |
| argo-rollouts | argo-rollouts | argo-rollouts | 2.43.9 (app: v1.10.2) | 2.43.12 (app: v1.10.2) | Yes | No |
| coder | coder | coder | 2.39.0 (app: 2.39.0) | 2.39.1 (app: 2.39.1) | Yes | No |
| istio-base | base | istio-system | 1.30.7 (app: 1.30.7) | 1.30.8 (app: 1.30.8) | Yes | No |
| istio-cni | cni | istio-system | 1.30.7 (app: 1.30.7) | 1.30.8 (app: 1.30.8) | Yes | No |
| istio-ingressgateway | gateway | istio-system | 1.30.7 (app: 1.30.7) | 1.30.8 (app: 1.30.8) | Yes | No |
| istiod | istiod | istio-system | 1.30.7 (app: 1.30.7) | 1.30.8 (app: 1.30.8) | Yes | No |
| ztunnel | ztunnel | istio-system | 1.30.7 (app: 1.30.7) | 1.30.8 (app: 1.30.8) | Yes | No |
| jellyfin | jellyfin | jellyfin | 3.2.0 (app: 10.11.8) | 3.7.0 (app: 12.4) | Yes | No |
| cilium | cilium | kube-system | 1.20.3 (app: 1.20.3) | 1.21.0-pre.4 (app: 1.21.0-pre.4) | Yes | No |
| grafana | grafana | monitoring | 14.4.0 (app: 13.3.0) | 14.4.1 (app: 13.3.1) | Yes | No |
| loki | loki | monitoring | 21.0.0 (app: 3.7.9) | 21.2.0 (app: 3.7.9) | Yes | No |
| victoria-metrics | victoria-metrics-single | monitoring | 0.50.0 (app: v1.155.0) | 0.51.0 (app: v1.156.0) | Yes | No |

### Outdated Container Images

| Image | Current Version | Latest Version | Latest Minor | Latest Patch |
| ----- | --------------- | -------------- | ------------ | ------------ |
| registry.k8s.io/cpa/cluster-proportional-autoscaler | v1.10.3 | v1.11.0 | v1.11.0 | v1.10.3 |
| registry.k8s.io/metrics-server/metrics-server | v0.9.0 | v0.9.1 | v0.9.0 | v0.9.1 |
| registry.k8s.io/nfd/node-feature-discovery | v0.19.0 | v0.20.1 | v0.19.0 | v0.19.0 |
| registry.k8s.io/coredns/coredns | v1.14.2 | v1.15.0 | v1.15.0 | v1.14.7 |
| registry.k8s.io/autoscaling/vpa-recommender | 1.7.1 | 1.8.1 | 1.8.1 | 1.7.3 |
| registry.k8s.io/dns/k8s-dns-node-cache | 1.25.0 | 1.27.1 | 1.27.1 | 1.25.0 |
| registry.k8s.io/kube-scheduler | v1.36.5 | v1.37.2 | v1.37.2 | v1.36.6 |
| registry.k8s.io/kube-apiserver | v1.36.5 | v1.37.2 | v1.37.2 | v1.36.6 |
| ghcr.io/kube-vip/kube-vip | v1.0.3 | v1.3.1 | v1.3.1 | v1.0.4 |
| registry.k8s.io/kube-controller-manager | v1.36.5 | v1.37.2 | v1.37.2 | v1.36.6 |
| ghcr.io/coder/coder | v2.39.0 | v2.39.1 | v2.39.1 | v2.39.1 |
| quay.io/opstree/redis | v7.0.15 | v8.10.1 | v7.4.11 | v7.0.15 |
| hashicorp/vault | 2.0.4 | 2.2.1 | 2.2.1 | 2.0.4 |
| hashicorp/vault | 2.0.3 | 2.2.1 | 2.2.1 | 2.0.4 |
| docker.io/longhornio/csi-resizer | v2.2.1 | v2.3.0 | v2.3.0 | v2.2.1 |
| docker.io/alpine/k8s | 1.35.4 | 1.37.2 | 1.37.2 | 1.35.10 |
| victoriametrics/victoria-metrics | v1.155.0 | v1.156.0 | v1.156.0 | v1.155.0 |
| docker.io/longhornio/csi-snapshotter | v8.6.0 | v8.7.0 | v8.7.0 | v8.6.0 |
| registry.istio.io/release/ztunnel | 1.30.7-distroless | 1.30.8-distroless | 1.30.8-distroless | 1.30.8-distroless |
| registry.istio.io/release/install-cni | 1.30.7-distroless | 1.30.8-distroless | 1.30.8-distroless | 1.30.8-distroless |
| registry.istio.io/release/proxyv2 | 1.30.7-distroless | 1.30.8-distroless | 1.30.8-distroless | 1.30.8-distroless |
| registry.istio.io/release/pilot | 1.30.7-distroless | 1.30.8-distroless | 1.30.8-distroless | 1.30.8-distroless |
| registry.istio.io/release/proxyv2 | 1.30.4-distroless | 1.30.8-distroless | 1.30.8-distroless | 1.30.8-distroless |
| docker.io/grafana/grafana | 13.3.0-distroless | 13.3.1-distroless | 13.3.1-distroless | 13.3.1-distroless |
| ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib | 0.156.0 | 0.165.0 | 0.156.0 | 0.156.0 |
| quay.io/brancz/kube-rbac-proxy | v0.18.1 | v0.23.1 | v0.18.1 | v0.18.2 |
