# Nova Diagnosis Report

Generated at ```2026-08-14T06:35:36.509Z```

## Context: ```ws```

### Outdated or Deprecated Helm Releases

| Release | Chart | Namespace | Installed Version | Latest Version | Outdated | Deprecated |
| ------- | ----- | --------- | ----------------- | -------------- | -------- | ---------- |
| argo-cd | argo-cd | argo-cd | 10.3.0 (app: v3.5.0) | 10.3.3 (app: v3.5.1) | Yes | No |
| cilium | cilium | kube-system | 1.19.3 (app: 1.19.3) | 1.21.0-pre.0 (app: 1.21.0-pre.0) | Yes | No |
| longhorn | longhorn | longhorn | 1.12.0 (app: v1.12.0) | 1.12.1 (app: v1.12.1) | Yes | No |
| grafana | grafana | monitoring | 10.5.15 (app: 12.3.1) | 10.5.15 (app: 12.3.1) | No | Yes |
| loki | loki | monitoring | 7.2.0 (app: 3.6.11) | 7.3.0 (app: 3.6.12) | Yes | No |
| opentelemetry-operator | opentelemetry-operator | monitoring | 0.120.2 (app: 0.156.0) | 0.121.0 (app: 0.157.0) | Yes | No |
| tempo | tempo | monitoring | 1.24.4 (app: 2.9.0) | 1.24.4 (app: 2.9.0) | No | Yes |
| reloader | reloader | reloader | 2.2.14 (app: v1.4.19) | 2.2.16 (app: v1.4.21) | Yes | No |
| vault-secrets-operator | vault-secrets-operator | vault-secrets-operator | 1.5.0 (app: 1.5.0) | 1.5.1 (app: 1.5.1) | Yes | No |
| vault | vault | vault | 0.34.0 (app: 2.0.3) | 0.34.1 (app: 2.0.4) | Yes | No |

#### Deprecated Only

| Release | Chart | Namespace | Installed Version | Latest Version |
| ------- | ----- | --------- | ----------------- | -------------- |
| grafana | grafana | monitoring | 10.5.15 (app: 12.3.1) | 10.5.15 (app: 12.3.1) |
| tempo | tempo | monitoring | 1.24.4 (app: 2.9.0) | 1.24.4 (app: 2.9.0) |

### Outdated Container Images

| Image | Current Version | Latest Version | Latest Minor | Latest Patch |
| ----- | --------------- | -------------- | ------------ | ------------ |
| ghcr.io/goauthentik/proxy | 2026.5.6 | 2026.8.0 | 2026.8.0 | 2026.5.6 |
| ghcr.io/open-telemetry/opentelemetry-operator/opentelemetry-operator | 0.156.0 | 0.157.0 | 0.156.0 | 0.156.0 |
| ghcr.io/kube-vip/kube-vip | v1.0.3 | v1.2.3 | v1.2.3 | v1.0.4 |
| ghcr.io/goauthentik/server | 2026.5.6 | 2026.8.0 | 2026.8.0 | 2026.5.6 |
| ghcr.io/cndoit18/lxcfs-manager | v0.2.5 | v0.2.7 | v0.2.5 | v0.2.7 |
| registry.k8s.io/metrics-server/metrics-server | v0.8.1 | v0.9.0 | v0.8.1 | v0.8.1 |
| registry.k8s.io/cpa/cluster-proportional-autoscaler | v1.8.8 | v1.10.3 | v1.10.3 | v1.8.9 |
| registry.k8s.io/coredns/coredns | v1.12.4 | v1.14.6 | v1.14.6 | v1.12.4 |
| registry.k8s.io/dns/k8s-dns-node-cache | 1.25.0 | 1.26.8 | 1.26.8 | 1.25.0 |
| hashicorp/vault | 2.0.3 | 2.0.4 | 2.0.4 | 2.0.4 |
| docker.io/longhornio/csi-snapshotter | v8.5.0-20260514 | v8.6.0 | v8.6.0 | v8.5.0 |
| prom/memcached-exporter | v0.15.4 | v0.16.0 | v0.15.4 | v0.15.5 |
| registry.k8s.io/kube-apiserver | v1.35.4 | v1.36.3 | v1.36.3 | v1.35.7 |
| registry.k8s.io/kube-controller-manager | v1.35.4 | v1.36.3 | v1.36.3 | v1.35.7 |
| registry.k8s.io/kube-scheduler | v1.35.4 | v1.36.3 | v1.36.3 | v1.35.7 |
| docker.io/longhornio/longhorn-manager | v1.12.0 | v1.12.1 | v1.12.1 | v1.12.1 |
| docker.io/longhornio/csi-provisioner | v5.3.0-20260514 | v6.3.0 | v5.3.0 | v5.3.0 |
| ghcr.io/stakater/reloader | v1.4.19 | v1.4.21 | v1.4.21 | v1.4.21 |
| vikunja/vikunja | 1.0.0 | 2.5.0 | 1.1.0 | 1.0.0 |
| hashicorp/vault-secrets-operator | 1.5.0 | 1.5.1 | 1.5.1 | 1.5.1 |
| docker.io/curlimages/curl | 8.9.1 | 8.21.0 | 8.21.0 | 8.9.1 |
| docker.io/kiwigrid/k8s-sidecar | 2.5.0 | 2.10.1 | 2.10.1 | 2.5.5 |
| docker.io/library/busybox | 1.31.1 | 1.38.0 | 1.38.0 | 1.31.1 |
| docker.io/longhornio/csi-resizer | v2.1.0-20260514 | v2.2.1 | v2.2.1 | v2.1.0 |
| docker.io/longhornio/longhorn-instance-manager | v1.12.0 | v1.12.1 | v1.12.1 | v1.12.1 |
| docker.io/longhornio/longhorn-share-manager | v1.12.0 | v1.12.1 | v1.12.1 | v1.12.1 |
| docker.io/longhornio/longhorn-ui | v1.12.0 | v1.12.1 | v1.12.1 | v1.12.1 |
| ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib | 0.156.0 | 0.158.0 | 0.156.0 | 0.156.0 |
| ecr-public.aws.com/docker/library/redis | 8.6.4-alpine | 8.10.0 | 8.10.0 | 8.6.5 |
| docker.io/rancher/local-path-provisioner | v0.0.32 | v0.0.37 | v0.0.32 | v0.0.37 |
| memcached | 1.6.39-alpine | 1.6.45 | 1.6.45 | 1.6.45 |
| docker.io/longhornio/longhorn-engine | v1.12.0 | v1.12.1 | v1.12.1 | v1.12.1 |
| docker.io/grafana/grafana | 12.3.1 | 13.1.3 | 12.4.8 | 12.3.10 |
| registry.istio.io/release/pilot | 1.30.3-distroless | 1.30.3 | 1.30.3 | 1.30.3 |
| registry.istio.io/release/ztunnel | 1.30.3-distroless | 1.30.3 | 1.30.3 | 1.30.3 |
| registry.istio.io/release/install-cni | 1.30.3-distroless | 1.30.3 | 1.30.3 | 1.30.3 |
| quay.io/brancz/kube-rbac-proxy | v0.18.1 | v0.22.1 | v0.18.1 | v0.18.2 |
| registry.istio.io/release/proxyv2 | 1.30.3-distroless | 1.30.3 | 1.30.3 | 1.30.3 |
| docker.io/grafana/tempo | 2.9.0 | 3.0.3 | 2.10.8 | 2.9.5 |
| docker.io/jellyfin/jellyfin | 10.11.8 | 10.11.11 | 10.11.11 | 10.11.11 |
