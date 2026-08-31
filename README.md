# Diagnosis
# Nova Diagnosis Report

Generated at ```2026-08-31T03:51:19.253Z```

## Context: ```ws```

### Outdated or Deprecated Helm Releases

| Release | Chart | Namespace | Installed Version | Latest Version | Outdated | Deprecated |
| ------- | ----- | --------- | ----------------- | -------------- | -------- | ---------- |
| argo-cd | argo-cd | argo-cd | 10.4.0 (app: v3.5.1) | 10.4.2 (app: v3.5.2) | Yes | No |
| argo-rollouts | argo-rollouts | argo-rollouts | 2.41.1 (app: v1.9.1) | 2.42.0 (app: v1.9.1) | Yes | No |
| coder | coder | coder | 2.36.1 (app: 2.36.1) | 2.36.3 (app: 2.36.3) | Yes | No |
| gpu-operator | gpu-operator | gpu-operator | v26.3.3 (app: v26.3.3) | v26.7.0 (app: v26.7.0) | Yes | No |
| istio-base | base | istio-system | 1.30.3 (app: 1.30.3) | 1.30.4 (app: 1.30.4) | Yes | No |
| istio-cni | cni | istio-system | 1.30.3 (app: 1.30.3) | 1.30.4 (app: 1.30.4) | Yes | No |
| istio-ingressgateway | gateway | istio-system | 1.30.3 (app: 1.30.3) | 1.30.4 (app: 1.30.4) | Yes | No |
| istiod | istiod | istio-system | 1.30.3 (app: 1.30.3) | 1.30.4 (app: 1.30.4) | Yes | No |
| ztunnel | ztunnel | istio-system | 1.30.3 (app: 1.30.3) | 1.30.4 (app: 1.30.4) | Yes | No |
| cilium | cilium | kube-system | 1.19.3 (app: 1.19.3) | 1.21.0-pre.0 (app: 1.21.0-pre.0) | Yes | No |
| grafana | grafana | monitoring | 12.11.1 (app: 13.2.0) | 13.0.1 (app: 13.2.0) | Yes | No |
| loki | loki | monitoring | 18.11.0 (app: 3.7.6) | 18.11.7 (app: 3.7.7) | Yes | No |
| tempo | tempo | monitoring | 2.2.4 (app: 2.10.8) | 2.3.0 (app: 2.10.8) | Yes | No |

### Outdated Container Images

| Image | Current Version | Latest Version | Latest Minor | Latest Patch |
| ----- | --------------- | -------------- | ------------ | ------------ |
| registry.k8s.io/cpa/cluster-proportional-autoscaler | v1.8.8 | v1.10.3 | v1.10.3 | v1.8.9 |
| registry.k8s.io/metrics-server/metrics-server | v0.8.1 | v0.9.0 | v0.8.1 | v0.8.1 |
| registry.k8s.io/nfd/node-feature-discovery | v0.18.3 | v0.19.0 | v0.18.3 | v0.18.3 |
| ghcr.io/kube-vip/kube-vip | v1.0.3 | v1.2.3 | v1.2.3 | v1.0.4 |
| registry.k8s.io/dns/k8s-dns-node-cache | 1.25.0 | 1.26.8 | 1.26.8 | 1.25.0 |
| registry.k8s.io/coredns/coredns | v1.12.4 | v1.14.7 | v1.14.7 | v1.12.4 |
| ghcr.io/cndoit18/lxcfs-manager | v0.2.5 | v0.2.7 | v0.2.5 | v0.2.7 |
| registry.k8s.io/kube-apiserver | v1.35.4 | v1.37.0 | v1.37.0 | v1.35.8 |
| registry.k8s.io/kube-controller-manager | v1.35.4 | v1.37.0 | v1.37.0 | v1.35.8 |
| registry.k8s.io/kube-scheduler | v1.35.4 | v1.37.0 | v1.37.0 | v1.35.8 |
| ghcr.io/coder/coder | v2.36.1 | v2.36.3 | v2.36.3 | v2.36.3 |
| hashicorp/vault | 2.0.3 | 2.0.4 | 2.0.4 | 2.0.4 |
| docker.io/longhornio/csi-provisioner | v5.3.0 | v6.3.0 | v5.3.0 | v5.3.0 |
| docker.io/library/memcached | 1.6.45-alpine | 1.6.45 | 1.6.45 | 1.6.45 |
| docker.io/kiwigrid/k8s-sidecar | 2.10.1 | 2.10.3 | 2.10.3 | 2.10.3 |
| docker.io/rancher/local-path-provisioner | v0.0.32 | v0.0.37 | v0.0.32 | v0.0.37 |
| docker.io/longhornio/longhorn-engine | v1.12.0 | v1.12.1 | v1.12.1 | v1.12.1 |
| ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib | 0.156.0 | 0.159.0 | 0.156.0 | 0.156.0 |
| ecr-public.aws.com/docker/library/redis | 8.6.4-alpine | 8.10.1 | 8.10.1 | 8.6.6 |
| registry.istio.io/release/ztunnel | 1.30.3-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| registry.istio.io/release/install-cni | 1.30.3-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| registry.istio.io/release/pilot | 1.30.3-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| registry.istio.io/release/proxyv2 | 1.30.3-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| nvcr.io/nvidia/gpu-operator | v26.3.3 | v26.7.0 | v26.7.0 | v26.3.3 |
| nvcr.io/nvidia/k8s/dcgm-exporter | 4.5.3-4.8.2-distroless | 4.8.3 | 4.8.3 | 4.5.3-4.8.2-distroless |
| nvcr.io/nvidia/k8s-device-plugin | v0.19.3 | v0.20.0 | v0.19.3 | v0.19.3 |
| quay.io/argoproj/argo-rollouts | v1.9.1 | v1.10.0 | v1.10.0 | v1.9.1 |
| quay.io/brancz/kube-rbac-proxy | v0.18.1 | v0.22.1 | v0.18.1 | v0.18.2 |
| docker.io/grafana/tempo | 2.10.8 | 3.0.3 | 2.10.8 | 2.10.8 |
| docker.io/jellyfin/jellyfin | 10.11.8 | 10.11.11 | 10.11.11 | 10.11.11 |
