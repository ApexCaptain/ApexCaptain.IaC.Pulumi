# Nova Diagnosis Report

Generated at ```2026-09-12T02:02:36.703Z```

## Context: ```ws```

### Outdated or Deprecated Helm Releases

| Release | Chart | Namespace | Installed Version | Latest Version | Outdated | Deprecated |
| ------- | ----- | --------- | ----------------- | -------------- | -------- | ---------- |
| argo-cd | argo-cd | argo-cd | 10.8.4 (app: v3.5.2) | 10.9.0 (app: v3.5.2) | Yes | No |
| authentik | authentik | authentik | 2026.8.1 (app: 2026.8.1) | 2026.8.2 (app: 2026.8.2) | Yes | No |
| cert-manager | cert-manager | cert-manager | v1.21.1 (app: v1.21.1) | v1.21.2 (app: v1.21.2) | Yes | No |
| cilium | cilium | kube-system | 1.19.3 (app: 1.19.3) | 1.21.0-pre.2 (app: 1.21.0-pre.2) | Yes | No |
| grafana | grafana | monitoring | 13.2.2 (app: 13.2.1) | 13.2.3 (app: 13.2.1) | Yes | No |
| loki | loki | monitoring | 18.12.1 (app: 3.7.7) | 18.12.2 (app: 3.7.7) | Yes | No |
| tempo | tempo | monitoring | 2.3.0 (app: 2.10.8) | 3.0.0 (app: 3.0.3) | Yes | No |

### Outdated Container Images

| Image | Current Version | Latest Version | Latest Minor | Latest Patch |
| ----- | --------------- | -------------- | ------------ | ------------ |
| registry.k8s.io/cpa/cluster-proportional-autoscaler | v1.8.8 | v1.11.0 | v1.11.0 | v1.8.9 |
| registry.k8s.io/metrics-server/metrics-server | v0.8.1 | v0.9.0 | v0.8.1 | v0.8.1 |
| registry.k8s.io/coredns/coredns | v1.12.4 | v1.14.7 | v1.14.7 | v1.12.4 |
| registry.k8s.io/dns/k8s-dns-node-cache | 1.25.0 | 1.26.8 | 1.26.8 | 1.25.0 |
| ghcr.io/kube-vip/kube-vip | v1.0.3 | v1.2.3 | v1.2.3 | v1.0.4 |
| ghcr.io/cndoit18/lxcfs-manager | v0.2.5 | v0.2.7 | v0.2.5 | v0.2.7 |
| ghcr.io/goauthentik/server | 2026.8.1 | 2026.8.2 | 2026.8.2 | 2026.8.2 |
| ghcr.io/goauthentik/proxy | 2026.8.1 | 2026.8.2 | 2026.8.2 | 2026.8.2 |
| registry.k8s.io/kube-controller-manager | v1.35.4 | v1.37.0 | v1.37.0 | v1.35.8 |
| registry.k8s.io/kube-apiserver | v1.35.4 | v1.37.0 | v1.37.0 | v1.35.8 |
| registry.k8s.io/kube-scheduler | v1.35.4 | v1.37.0 | v1.37.0 | v1.35.8 |
| docker.io/rancher/local-path-provisioner | v0.0.32 | v0.0.37 | v0.0.32 | v0.0.37 |
| docker.io/library/memcached | 1.6.45-alpine | 1.6.45 | 1.6.45 | 1.6.45 |
| registry.istio.io/release/ztunnel | 1.30.4-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| hashicorp/vault | 2.0.3 | 2.1.0 | 2.1.0 | 2.0.4 |
| docker.io/longhornio/csi-provisioner | v5.3.0 | v6.3.0 | v5.3.0 | v5.3.0 |
| hashicorp/vault | 2.0.4 | 2.1.0 | 2.1.0 | 2.0.4 |
| registry.istio.io/release/install-cni | 1.30.4-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| registry.istio.io/release/pilot | 1.30.4-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| registry.istio.io/release/proxyv2 | 1.30.4-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| docker.io/grafana/grafana | 13.2.1-distroless | 13.2.1 | 13.2.1 | 13.2.1 |
| docker.io/longhornio/longhorn-engine | v1.12.0 | v1.12.1 | v1.12.1 | v1.12.1 |
| ecr-public.aws.com/docker/library/redis | 8.6.4-alpine | 8.10.1 | 8.10.1 | 8.6.6 |
| ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib | 0.156.0 | 0.160.0 | 0.156.0 | 0.156.0 |
| quay.io/jetstack/cert-manager-cainjector | v1.21.1 | v1.21.2 | v1.21.2 | v1.21.2 |
| quay.io/jetstack/cert-manager-webhook | v1.21.1 | v1.21.2 | v1.21.2 | v1.21.2 |
| quay.io/jetstack/cert-manager-controller | v1.21.1 | v1.21.2 | v1.21.2 | v1.21.2 |
| quay.io/brancz/kube-rbac-proxy | v0.18.1 | v0.22.1 | v0.18.1 | v0.18.2 |
| nvcr.io/nvidia/k8s/dcgm-exporter | 4.6.0-4.8.3-distroless | 4.8.3 | 4.8.3 | 4.6.0-4.8.3-distroless |
| docker.io/grafana/tempo | 2.10.8 | 3.0.3 | 2.10.8 | 2.10.8 |
| docker.io/jellyfin/jellyfin | 10.11.8 | 12.0.0 | 10.11.11 | 10.11.11 |
