# Nova Diagnosis Report

Generated at ```2026-10-10T12:20:01.993Z```

## Context: ```ws```

### Outdated or Deprecated Helm Releases

| Release | Chart | Namespace | Installed Version | Latest Version | Outdated | Deprecated |
| ------- | ----- | --------- | ----------------- | -------------- | -------- | ---------- |
| argo-cd | argo-cd | argo-cd | 10.9.6 (app: v3.5.3) | 10.10.2 (app: v3.5.4) | Yes | No |
| cilium | cilium | kube-system | 1.19.3 (app: 1.19.3) | 1.21.0-pre.3 (app: 1.21.0-pre.3) | Yes | No |
| grafana | grafana | monitoring | 13.2.7 (app: 13.2.3) | 13.5.0 (app: 13.2.3) | Yes | No |
| loki | loki | monitoring | 18.13.8 (app: 3.7.8) | 18.15.1 (app: 3.7.8) | Yes | No |

### Outdated Container Images

| Image | Current Version | Latest Version | Latest Minor | Latest Patch |
| ----- | --------------- | -------------- | ------------ | ------------ |
| registry.k8s.io/cpa/cluster-proportional-autoscaler | v1.8.8 | v1.11.0 | v1.11.0 | v1.8.9 |
| registry.k8s.io/metrics-server/metrics-server | v0.8.1 | v0.9.0 | v0.8.1 | v0.8.1 |
| registry.k8s.io/coredns/coredns | v1.12.4 | v1.14.7 | v1.14.7 | v1.12.4 |
| registry.k8s.io/autoscaling/vpa-recommender | 1.7.1 | 1.8.0 | 1.8.0 | 1.7.2 |
| registry.k8s.io/dns/k8s-dns-node-cache | 1.25.0 | 1.27.1 | 1.27.1 | 1.25.0 |
| registry.k8s.io/kube-controller-manager | v1.35.4 | v1.37.1 | v1.37.1 | v1.35.9 |
| registry.k8s.io/kube-apiserver | v1.35.4 | v1.37.1 | v1.37.1 | v1.35.9 |
| registry.k8s.io/kube-scheduler | v1.35.4 | v1.37.1 | v1.37.1 | v1.35.9 |
| ghcr.io/kube-vip/kube-vip | v1.0.3 | v1.2.4 | v1.2.4 | v1.0.4 |
| hashicorp/vault | 2.0.4 | 2.1.2 | 2.1.2 | 2.0.4 |
| docker.io/rancher/local-path-provisioner | v0.0.32 | v0.0.37 | v0.0.32 | v0.0.37 |
| docker.io/library/memcached | 1.6.45-alpine | 1.6.45 | 1.6.45 | 1.6.45 |
| docker.io/kiwigrid/k8s-sidecar | 2.11.2 | 2.14.1 | 2.14.1 | 2.11.2 |
| hashicorp/vault | 2.0.3 | 2.1.2 | 2.1.2 | 2.0.4 |
| registry.istio.io/release/ztunnel | 1.30.5-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| registry.istio.io/release/proxyv2 | 1.30.4-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| registry.istio.io/release/install-cni | 1.30.5-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| registry.istio.io/release/proxyv2 | 1.30.5-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| docker.io/longhornio/longhorn-instance-manager | v1.12.1 | v1.13.0 | v1.13.0 | v1.12.1 |
| ghcr.io/dexidp/dex | v2.45.1 | v2.46.0 | v2.46.0 | v2.45.1 |
| docker.io/grafana/grafana | 13.2.3-distroless | 13.2.3 | 13.2.3 | 13.2.3 |
| docker.io/longhornio/longhorn-engine | v1.12.0 | v1.13.0 | v1.13.0 | v1.12.1 |
| ecr-public.aws.com/docker/library/redis | 8.6.4-alpine | 8.10.2 | 8.10.2 | 8.6.7 |
| registry.istio.io/release/pilot | 1.30.5-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| nvcr.io/nvidia/k8s/dcgm-exporter | 4.6.1-4.8.4-distroless | 4.8.4 | 4.8.4 | 4.6.1-4.8.4-distroless |
| ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib | 0.156.0 | 0.162.0 | 0.156.0 | 0.156.0 |
| quay.io/brancz/kube-rbac-proxy | v0.18.1 | v0.23.0 | v0.18.1 | v0.18.2 |
