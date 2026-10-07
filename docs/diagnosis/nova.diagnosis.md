# Nova Diagnosis Report

Generated at ```2026-10-07T05:39:39.224Z```

## Context: ```ws```

### Outdated or Deprecated Helm Releases

| Release | Chart | Namespace | Installed Version | Latest Version | Outdated | Deprecated |
| ------- | ----- | --------- | ----------------- | -------------- | -------- | ---------- |
| cilium | cilium | kube-system | 1.19.3 (app: 1.19.3) | 1.21.0-pre.3 (app: 1.21.0-pre.3) | Yes | No |
| longhorn | longhorn | longhorn | 1.12.1 (app: v1.12.1) | 1.13.0 (app: v1.13.0) | Yes | No |

### Outdated Container Images

| Image | Current Version | Latest Version | Latest Minor | Latest Patch |
| ----- | --------------- | -------------- | ------------ | ------------ |
| registry.k8s.io/metrics-server/metrics-server | v0.8.1 | v0.9.0 | v0.8.1 | v0.8.1 |
| registry.k8s.io/coredns/coredns | v1.12.4 | v1.14.7 | v1.14.7 | v1.12.4 |
| registry.k8s.io/dns/k8s-dns-node-cache | 1.25.0 | 1.27.1 | 1.27.1 | 1.25.0 |
| registry.k8s.io/cpa/cluster-proportional-autoscaler | v1.8.8 | v1.11.0 | v1.11.0 | v1.8.9 |
| registry.k8s.io/autoscaling/vpa-recommender | 1.7.1 | 1.8.0 | 1.8.0 | 1.7.2 |
| registry.k8s.io/kube-scheduler | v1.35.4 | v1.37.1 | v1.37.1 | v1.35.9 |
| registry.k8s.io/kube-controller-manager | v1.35.4 | v1.37.1 | v1.37.1 | v1.35.9 |
| ghcr.io/kube-vip/kube-vip | v1.0.3 | v1.2.4 | v1.2.4 | v1.0.4 |
| registry.k8s.io/kube-apiserver | v1.35.4 | v1.37.1 | v1.37.1 | v1.35.9 |
| hashicorp/vault | 2.0.4 | 2.1.1 | 2.1.1 | 2.0.4 |
| docker.io/longhornio/longhorn-ui | v1.12.1 | v1.13.0 | v1.13.0 | v1.12.1 |
| docker.io/longhornio/longhorn-manager | v1.12.1 | v1.13.0 | v1.13.0 | v1.12.1 |
| docker.io/longhornio/csi-attacher | v4.12.0 | v4.13.0 | v4.13.0 | v4.12.0 |
| docker.io/longhornio/longhorn-share-manager | v1.12.1 | v1.13.0 | v1.13.0 | v1.12.1 |
| docker.io/longhornio/csi-provisioner | v5.3.0 | v6.3.0 | v5.3.0 | v5.3.0 |
| docker.io/longhornio/csi-node-driver-registrar | v2.17.0 | v2.18.0 | v2.18.0 | v2.17.0 |
| docker.io/longhornio/livenessprobe | v2.19.0 | v2.20.0 | v2.20.0 | v2.19.0 |
| docker.io/library/memcached | 1.6.45-alpine | 1.6.45 | 1.6.45 | 1.6.45 |
| docker.io/rancher/local-path-provisioner | v0.0.32 | v0.0.37 | v0.0.32 | v0.0.37 |
| hashicorp/vault | 2.0.3 | 2.1.1 | 2.1.1 | 2.0.4 |
| docker.io/longhornio/longhorn-engine | v1.12.1 | v1.13.0 | v1.13.0 | v1.12.1 |
| registry.istio.io/release/ztunnel | 1.30.5-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| registry.istio.io/release/install-cni | 1.30.5-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| ecr-public.aws.com/docker/library/redis | 8.6.4-alpine | 8.10.2 | 8.10.2 | 8.6.7 |
| docker.io/longhornio/longhorn-engine | v1.12.0 | v1.13.0 | v1.13.0 | v1.12.1 |
| docker.io/longhornio/longhorn-instance-manager | v1.12.1 | v1.13.0 | v1.13.0 | v1.12.1 |
| registry.istio.io/release/pilot | 1.30.5-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| registry.istio.io/release/proxyv2 | 1.30.5-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| registry.istio.io/release/proxyv2 | 1.30.4-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| docker.io/grafana/grafana | 13.2.3-distroless | 13.2.3 | 13.2.3 | 13.2.3 |
| nvcr.io/nvidia/k8s/dcgm-exporter | 4.6.1-4.8.4-distroless | 4.8.4 | 4.8.4 | 4.6.1-4.8.4-distroless |
| ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib | 0.156.0 | 0.162.0 | 0.156.0 | 0.156.0 |
| quay.io/brancz/kube-rbac-proxy | v0.18.1 | v0.23.0 | v0.18.1 | v0.18.2 |
