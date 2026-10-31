# Nova Diagnosis Report

Generated at ```2026-10-31T00:51:19.730Z```

## Context: ```ws```

### Outdated or Deprecated Helm Releases

| Release | Chart | Namespace | Installed Version | Latest Version | Outdated | Deprecated |
| ------- | ----- | --------- | ----------------- | -------------- | -------- | ---------- |
| argo-cd | argo-cd | argo-cd | 10.11.0 (app: v3.5.5) | 10.11.6 (app: v3.5.6) | Yes | No |
| cert-manager | cert-manager | cert-manager | v1.21.2 (app: v1.21.2) | v1.21.3 (app: v1.21.3) | Yes | No |
| coder | coder | coder | 2.38.1 (app: 2.38.1) | 2.38.5 (app: 2.38.5) | Yes | No |
| jellyfin | jellyfin | jellyfin | 3.2.0 (app: 10.11.8) | 3.7.0 (app: 12.4) | Yes | No |
| cilium | cilium | kube-system | 1.20.2 (app: 1.20.2) | 1.21.0-pre.3 (app: 1.21.0-pre.3) | Yes | No |
| grafana | grafana | monitoring | 14.0.1 (app: 13.2.4) | 14.2.0 (app: 13.3.0) | Yes | No |
| loki | loki | monitoring | 19.1.1 (app: 3.7.9) | 20.2.0 (app: 3.7.9) | Yes | No |
| opentelemetry-operator | opentelemetry-operator | monitoring | 0.126.2 (app: 0.161.0) | 0.128.0 (app: 0.162.0) | Yes | No |
| victoria-metrics | victoria-metrics-single | monitoring | 0.49.0 (app: v1.154.0) | 0.50.0 (app: v1.155.0) | Yes | No |
| reloader | reloader | reloader | 2.2.18 (app: v1.4.22) | 2.2.19 (app: v1.4.23) | Yes | No |

### Outdated Container Images

| Image | Current Version | Latest Version | Latest Minor | Latest Patch |
| ----- | --------------- | -------------- | ------------ | ------------ |
| registry.k8s.io/metrics-server/metrics-server | v0.9.0 | v0.9.1 | v0.9.0 | v0.9.1 |
| registry.k8s.io/nfd/node-feature-discovery | v0.19.0 | v0.20.1 | v0.19.0 | v0.19.0 |
| registry.k8s.io/cpa/cluster-proportional-autoscaler | v1.10.3 | v1.11.0 | v1.11.0 | v1.10.3 |
| registry.k8s.io/dns/k8s-dns-node-cache | 1.25.0 | 1.27.1 | 1.27.1 | 1.25.0 |
| registry.k8s.io/autoscaling/vpa-recommender | 1.7.1 | 1.8.1 | 1.8.1 | 1.7.3 |
| registry.k8s.io/coredns/coredns | v1.12.4 | v1.15.0 | v1.15.0 | v1.12.4 |
| ghcr.io/kube-vip/kube-vip | v1.0.3 | v1.3.1 | v1.3.1 | v1.0.4 |
| registry.k8s.io/kube-controller-manager | v1.35.9 | v1.37.2 | v1.37.2 | v1.35.10 |
| ghcr.io/open-telemetry/opentelemetry-operator/opentelemetry-operator | 0.161.0 | 0.162.0 | 0.161.0 | 0.161.0 |
| registry.k8s.io/kube-scheduler | v1.35.9 | v1.37.2 | v1.37.2 | v1.35.10 |
| registry.k8s.io/kube-apiserver | v1.35.9 | v1.37.2 | v1.37.2 | v1.35.10 |
| docker.io/longhornio/csi-snapshotter | v8.6.0 | v8.7.0 | v8.7.0 | v8.6.0 |
| quay.io/opstree/redis | v7.0.15 | v8.10.1 | v7.4.11 | v7.0.15 |
| ghcr.io/coder/coder | v2.38.1 | v2.38.5 | v2.38.5 | v2.38.5 |
| ghcr.io/dexidp/dex | v2.46.0 | v2.46.1 | v2.46.1 | v2.46.1 |
| hashicorp/vault | 2.0.4 | 2.2.1 | 2.2.1 | 2.0.4 |
| docker.io/longhornio/csi-resizer | v2.2.1 | v2.3.0 | v2.3.0 | v2.2.1 |
| hashicorp/vault | 2.0.3 | 2.2.1 | 2.2.1 | 2.0.4 |
| docker.io/alpine/k8s | 1.35.4 | 1.37.1 | 1.37.1 | 1.35.9 |
| ghcr.io/stakater/reloader | v1.4.22 | v1.4.23 | v1.4.23 | v1.4.23 |
| registry.istio.io/release/proxyv2 | 1.30.4-distroless | 1.30.7-distroless | 1.30.7-distroless | 1.30.7-distroless |
| victoriametrics/victoria-metrics | v1.154.0 | v1.155.0 | v1.155.0 | v1.154.1 |
| docker.io/grafana/grafana | 13.2.4-distroless | 13.3.0-distroless | 13.3.0-distroless | 13.2.5-distroless |
| quay.io/jetstack/cert-manager-cainjector | v1.21.2 | v1.21.3 | v1.21.3 | v1.21.3 |
| quay.io/jetstack/cert-manager-webhook | v1.21.2 | v1.21.3 | v1.21.3 | v1.21.3 |
| ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib | 0.156.0 | 0.164.0 | 0.156.0 | 0.156.0 |
| quay.io/brancz/kube-rbac-proxy | v0.18.1 | v0.23.1 | v0.18.1 | v0.18.2 |
| quay.io/jetstack/cert-manager-controller | v1.21.2 | v1.21.3 | v1.21.3 | v1.21.3 |
