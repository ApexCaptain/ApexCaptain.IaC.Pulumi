# Nova Diagnosis Report

Generated at ```2026-10-13T05:47:46.230Z```

## Nova CLI Version Mismatch

Remote version ```3.12.2``` is greater than local version ```3.12.1```

Please update your Nova CLI to the latest version.

## Context: ```ws```

### Outdated or Deprecated Helm Releases

| Release | Chart | Namespace | Installed Version | Latest Version | Outdated | Deprecated |
| ------- | ----- | --------- | ----------------- | -------------- | -------- | ---------- |
| cilium | cilium | kube-system | 1.20.2 (app: 1.20.2) | 1.21.0-pre.3 (app: 1.21.0-pre.3) | Yes | No |

### Outdated Container Images

| Image | Current Version | Latest Version | Latest Minor | Latest Patch |
| ----- | --------------- | -------------- | ------------ | ------------ |
| registry.k8s.io/cpa/cluster-proportional-autoscaler | v1.10.3 | v1.11.0 | v1.11.0 | v1.10.3 |
| registry.k8s.io/autoscaling/vpa-recommender | 1.7.1 | 1.8.0 | 1.8.0 | 1.7.2 |
| registry.k8s.io/dns/k8s-dns-node-cache | 1.25.0 | 1.27.1 | 1.27.1 | 1.25.0 |
| registry.k8s.io/coredns/coredns | v1.12.4 | v1.14.7 | v1.14.7 | v1.12.4 |
| registry.k8s.io/kube-apiserver | v1.35.4 | v1.37.1 | v1.37.1 | v1.35.9 |
| registry.k8s.io/kube-scheduler | v1.35.4 | v1.37.1 | v1.37.1 | v1.35.9 |
| registry.k8s.io/kube-controller-manager | v1.35.4 | v1.37.1 | v1.37.1 | v1.35.9 |
| ghcr.io/kube-vip/kube-vip | v1.0.3 | v1.2.4 | v1.2.4 | v1.0.4 |
| docker.io/alpine/k8s | 1.35.4 | 1.37.1 | 1.37.1 | 1.35.9 |
| hashicorp/vault-secrets-operator | 1.6.0 | 1.6.1 | 1.6.1 | 1.6.1 |
| docker.io/longhornio/csi-resizer | v2.2.1 | v2.3.0 | v2.3.0 | v2.2.1 |
| hashicorp/vault | 2.0.3 | 2.1.2 | 2.1.2 | 2.0.4 |
| hashicorp/vault | 2.0.4 | 2.1.2 | 2.1.2 | 2.0.4 |
| docker.io/library/memcached | 1.6.45-alpine | 1.6.45 | 1.6.45 | 1.6.45 |
| docker.io/grafana/grafana | 13.2.3-distroless | 13.2.3 | 13.2.3 | 13.2.3 |
| registry.istio.io/release/ztunnel | 1.30.5-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| ecr-public.aws.com/docker/library/redis | 8.6.4-alpine | 8.10.2 | 8.10.2 | 8.6.7 |
| ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib | 0.156.0 | 0.162.0 | 0.156.0 | 0.156.0 |
| registry.istio.io/release/install-cni | 1.30.5-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| registry.istio.io/release/proxyv2 | 1.30.4-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| registry.istio.io/release/proxyv2 | 1.30.5-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| registry.istio.io/release/pilot | 1.30.5-distroless | 1.30.5 | 1.30.5 | 1.30.5 |
| nvcr.io/nvidia/k8s/dcgm-exporter | 4.6.1-4.8.4-distroless | 4.8.4 | 4.8.4 | 4.6.1-4.8.4-distroless |
| quay.io/argoproj/argo-rollouts | v1.10.0 | v1.10.1 | v1.10.1 | v1.10.1 |
| quay.io/brancz/kube-rbac-proxy | v0.18.1 | v0.23.0 | v0.18.1 | v0.18.2 |
