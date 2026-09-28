# Nova Diagnosis Report

Generated at ```2026-09-21T05:07:11.362Z```

## Context: ```ws```

### Outdated or Deprecated Helm Releases

| Release | Chart | Namespace | Installed Version | Latest Version | Outdated | Deprecated |
| ------- | ----- | --------- | ----------------- | -------------- | -------- | ---------- |
| coder | coder | coder | 2.37.1 (app: 2.37.1) | 2.37.2 (app: 2.37.2) | Yes | No |
| cilium | cilium | kube-system | 1.19.3 (app: 1.19.3) | 1.21.0-pre.2 (app: 1.21.0-pre.2) | Yes | No |
| lxcfs | lxcfs-on-kubernetes | lxcfs | 0.2.7 (app: 0.2.7) | 0.2.8 (app: 0.2.8) | Yes | No |
| loki | loki | monitoring | 18.13.3 (app: 3.7.8) | 18.13.4 (app: 3.7.8) | Yes | No |
| victoria-metrics | victoria-metrics-single | monitoring | 0.46.0 (app: v1.151.0) | 0.47.0 (app: v1.152.0) | Yes | No |
| snapshot-controller | snapshot-controller | snapshot-controller | 5.2.0 (app: v8.6.0) | 5.3.0 (app: v8.6.0) | Yes | No |

### Outdated Container Images

| Image | Current Version | Latest Version | Latest Minor | Latest Patch |
| ----- | --------------- | -------------- | ------------ | ------------ |
| registry.k8s.io/cpa/cluster-proportional-autoscaler | v1.8.8 | v1.11.0 | v1.11.0 | v1.8.9 |
| registry.k8s.io/metrics-server/metrics-server | v0.8.1 | v0.9.0 | v0.8.1 | v0.8.1 |
| registry.k8s.io/coredns/coredns | v1.12.4 | v1.14.7 | v1.14.7 | v1.12.4 |
| registry.k8s.io/dns/k8s-dns-node-cache | 1.25.0 | 1.26.8 | 1.26.8 | 1.25.0 |
| ghcr.io/kube-vip/kube-vip | v1.0.3 | v1.2.4 | v1.2.4 | v1.0.4 |
| ghcr.io/cndoit18/lxcfs-agent | v0.2.7 | v0.2.8 | v0.2.7 | v0.2.8 |
| ghcr.io/cndoit18/lxcfs-manager | v0.2.5 | v0.2.8 | v0.2.5 | v0.2.8 |
| registry.k8s.io/kube-apiserver | v1.35.4 | v1.37.0 | v1.37.0 | v1.35.8 |
| registry.k8s.io/kube-scheduler | v1.35.4 | v1.37.0 | v1.37.0 | v1.35.8 |
| registry.k8s.io/kube-controller-manager | v1.35.4 | v1.37.0 | v1.37.0 | v1.35.8 |
| ghcr.io/coder/coder | v2.37.1 | v2.37.2 | v2.37.2 | v2.37.2 |
| docker.io/library/memcached | 1.6.45-alpine | 1.6.45 | 1.6.45 | 1.6.45 |
| docker.io/longhornio/csi-node-driver-registrar | v2.17.0 | v2.18.0 | v2.18.0 | v2.17.0 |
| hashicorp/vault | 2.0.3 | 2.1.1 | 2.1.1 | 2.0.4 |
| docker.io/longhornio/csi-provisioner | v5.3.0 | v6.3.0 | v5.3.0 | v5.3.0 |
| hashicorp/vault | 2.0.4 | 2.1.1 | 2.1.1 | 2.0.4 |
| docker.io/longhornio/csi-attacher | v4.12.0 | v4.13.0 | v4.13.0 | v4.12.0 |
| docker.io/longhornio/livenessprobe | v2.19.0 | v2.20.0 | v2.20.0 | v2.19.0 |
| victoriametrics/victoria-metrics | v1.151.0 | v1.152.0 | v1.152.0 | v1.151.0 |
| docker.io/rancher/local-path-provisioner | v0.0.32 | v0.0.37 | v0.0.32 | v0.0.37 |
| docker.io/longhornio/longhorn-engine | v1.12.0 | v1.12.1 | v1.12.1 | v1.12.1 |
| ecr-public.aws.com/docker/library/redis | 8.6.4-alpine | 8.10.1 | 8.10.1 | 8.6.6 |
| registry.istio.io/release/ztunnel | 1.30.4-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| registry.istio.io/release/install-cni | 1.30.4-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| registry.istio.io/release/proxyv2 | 1.30.4-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| registry.istio.io/release/pilot | 1.30.4-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib | 0.156.0 | 0.161.0 | 0.156.0 | 0.156.0 |
| docker.io/grafana/grafana | 13.2.2-distroless | 13.2.2 | 13.2.2 | 13.2.2 |
| nvcr.io/nvidia/k8s/dcgm-exporter | 4.6.0-4.8.3-distroless | 4.8.4 | 4.8.4 | 4.6.0-4.8.3-distroless |
| quay.io/brancz/kube-rbac-proxy | v0.18.1 | v0.22.1 | v0.18.1 | v0.18.2 |
