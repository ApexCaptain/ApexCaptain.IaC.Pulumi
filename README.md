# Diagnosis
# Nova Diagnosis Report

Generated at ```2026-07-27T08:32:54.782Z```

## Context: ```ws```

### Outdated or Deprecated Helm Releases

| Release | Chart | Namespace | Installed Version | Latest Version | Outdated | Deprecated |
| ------- | ----- | --------- | ----------------- | -------------- | -------- | ---------- |
| argo-cd | argo-cd | argo-cd | 10.1.2 (app: v3.4.4) | 10.2.1 (app: v3.4.5) | Yes | No |
| cilium | cilium | kube-system | 1.19.3 (app: 1.19.3) | 1.20.0-rc.1 (app: 1.20.0-rc.1) | Yes | No |

### Outdated Container Images

| Image | Current Version | Latest Version | Latest Minor | Latest Patch |
| ----- | --------------- | -------------- | ------------ | ------------ |
| ghcr.io/kube-vip/kube-vip | v1.0.3 | v1.2.1 | v1.2.1 | v1.0.4 |
| ghcr.io/goauthentik/proxy | 2026.5.4 | 2026.5.6 | 2026.5.6 | 2026.5.6 |
| registry.k8s.io/metrics-server/metrics-server | v0.8.1 | v0.9.0 | v0.8.1 | v0.8.1 |
| registry.k8s.io/cpa/cluster-proportional-autoscaler | v1.8.8 | v1.10.3 | v1.10.3 | v1.8.9 |
| registry.k8s.io/coredns/coredns | v1.12.4 | v1.14.6 | v1.14.6 | v1.12.4 |
| registry.k8s.io/dns/k8s-dns-node-cache | 1.25.0 | 1.26.8 | 1.26.8 | 1.25.0 |
| docker.io/longhornio/csi-provisioner | v5.3.0-20260514 | v6.3.0 | v5.3.0 | v5.3.0 |
| vikunja/vikunja | 1.0.0 | 2.4.0 | 1.1.0 | 1.0.0 |
| registry.k8s.io/kube-apiserver | v1.35.4 | v1.36.3 | v1.36.3 | v1.35.7 |
| registry.k8s.io/kube-controller-manager | v1.35.4 | v1.36.3 | v1.36.3 | v1.35.7 |
| registry.k8s.io/kube-scheduler | v1.35.4 | v1.36.3 | v1.36.3 | v1.35.7 |
| docker.io/rancher/local-path-provisioner | v0.0.32 | v0.0.36 | v0.0.32 | v0.0.36 |
| docker.io/longhornio/csi-resizer | v2.1.0-20260514 | v2.2.1 | v2.2.1 | v2.1.0 |
| hashicorp/vault | 2.0.2 | 2.0.3 | 2.0.3 | 2.0.3 |
| docker.io/longhornio/csi-snapshotter | v8.5.0-20260514 | v8.6.0 | v8.6.0 | v8.5.0 |
| ecr-public.aws.com/docker/library/redis | 8.2.3-alpine | 8.8.1 | 8.8.1 | 8.2.8 |
| registry.istio.io/release/ztunnel | 1.30.3-distroless | 1.30.3 | 1.30.3 | 1.30.3 |
| registry.istio.io/release/proxyv2 | 1.30.2-distroless | 1.30.3 | 1.30.3 | 1.30.3 |
| registry.istio.io/release/install-cni | 1.30.3-distroless | 1.30.3 | 1.30.3 | 1.30.3 |
| registry.istio.io/release/pilot | 1.30.3-distroless | 1.30.3 | 1.30.3 | 1.30.3 |
| registry.istio.io/release/proxyv2 | 1.30.3-distroless | 1.30.3 | 1.30.3 | 1.30.3 |
| quay.io/brancz/kube-rbac-proxy | v0.18.1 | v0.22.1 | v0.18.1 | v0.18.2 |
| docker.io/jellyfin/jellyfin | 10.11.8 | 10.11.11 | 10.11.11 | 10.11.11 |
