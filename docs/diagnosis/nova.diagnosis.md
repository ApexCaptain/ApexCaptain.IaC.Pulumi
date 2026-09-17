# Nova Diagnosis Report

Generated at ```2026-09-17T06:32:42.556Z```

## Context: ```ws```

### Outdated or Deprecated Helm Releases

| Release | Chart | Namespace | Installed Version | Latest Version | Outdated | Deprecated |
| ------- | ----- | --------- | ----------------- | -------------- | -------- | ---------- |
| argo-cd | argo-cd | argo-cd | 10.9.0 (app: v3.5.2) | 10.9.1 (app: v3.5.3) | Yes | No |
| goldilocks | goldilocks | goldilocks | 11.1.0 (app: v4.16.1) | 11.1.1 (app: v4.16.2) | Yes | No |
| cilium | cilium | kube-system | 1.19.3 (app: 1.19.3) | 1.21.0-pre.2 (app: 1.21.0-pre.2) | Yes | No |
| grafana | grafana | monitoring | 13.2.3 (app: 13.2.1) | 13.2.5 (app: 13.2.2) | Yes | No |
| loki | loki | monitoring | 18.12.2 (app: 3.7.7) | 18.13.2 (app: 3.7.7) | Yes | No |
| opentelemetry-operator | opentelemetry-operator | monitoring | 0.122.0 (app: 0.158.0) | 0.123.0 (app: 0.159.0) | Yes | No |
| tempo | tempo | monitoring | 2.3.0 (app: 2.10.8) | 3.0.0 (app: 3.0.3) | Yes | No |
| vpa | vpa | vpa | 5.0.1 (app: 1.7.1) | 5.1.0 (app: 1.7.1) | Yes | No |

### Outdated Container Images

| Image | Current Version | Latest Version | Latest Minor | Latest Patch |
| ----- | --------------- | -------------- | ------------ | ------------ |
| registry.k8s.io/cpa/cluster-proportional-autoscaler | v1.8.8 | v1.11.0 | v1.11.0 | v1.8.9 |
| registry.k8s.io/metrics-server/metrics-server | v0.8.1 | v0.9.0 | v0.8.1 | v0.8.1 |
| registry.k8s.io/dns/k8s-dns-node-cache | 1.25.0 | 1.26.8 | 1.26.8 | 1.25.0 |
| ghcr.io/cndoit18/lxcfs-manager | v0.2.5 | v0.2.7 | v0.2.5 | v0.2.7 |
| registry.k8s.io/coredns/coredns | v1.12.4 | v1.14.7 | v1.14.7 | v1.12.4 |
| ghcr.io/kube-vip/kube-vip | v1.0.3 | v1.2.4 | v1.2.4 | v1.0.4 |
| ghcr.io/open-telemetry/opentelemetry-operator/opentelemetry-operator | 0.158.0 | 0.159.0 | 0.158.0 | 0.158.0 |
| registry.k8s.io/kube-apiserver | v1.35.4 | v1.37.0 | v1.37.0 | v1.35.8 |
| registry.k8s.io/kube-scheduler | v1.35.4 | v1.37.0 | v1.37.0 | v1.35.8 |
| registry.k8s.io/kube-controller-manager | v1.35.4 | v1.37.0 | v1.37.0 | v1.35.8 |
| us-docker.pkg.dev/fairwinds-ops/oss/goldilocks | v4.16.1 | v4.16.2 | v4.16.2 | v4.16.2 |
| victoriametrics/victoria-metrics | v1.151.0 | v1.152.0 | v1.152.0 | v1.151.0 |
| hashicorp/vault | 2.0.4 | 2.1.1 | 2.1.1 | 2.0.4 |
| docker.io/rancher/local-path-provisioner | v0.0.32 | v0.0.37 | v0.0.32 | v0.0.37 |
| docker.io/longhornio/csi-attacher | v4.12.0 | v4.13.0 | v4.13.0 | v4.12.0 |
| hashicorp/vault | 2.0.3 | 2.1.1 | 2.1.1 | 2.0.4 |
| docker.io/longhornio/csi-provisioner | v5.3.0 | v6.3.0 | v5.3.0 | v5.3.0 |
| docker.io/longhornio/livenessprobe | v2.19.0 | v2.20.0 | v2.20.0 | v2.19.0 |
| docker.io/longhornio/csi-node-driver-registrar | v2.17.0 | v2.18.0 | v2.18.0 | v2.17.0 |
| docker.io/library/memcached | 1.6.45-alpine | 1.6.45 | 1.6.45 | 1.6.45 |
| registry.istio.io/release/ztunnel | 1.30.4-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| registry.istio.io/release/install-cni | 1.30.4-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| registry.istio.io/release/proxyv2 | 1.30.4-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| registry.istio.io/release/pilot | 1.30.4-distroless | 1.30.4 | 1.30.4 | 1.30.4 |
| ecr-public.aws.com/docker/library/redis | 8.6.4-alpine | 8.10.1 | 8.10.1 | 8.6.6 |
| docker.io/longhornio/longhorn-engine | v1.12.0 | v1.12.1 | v1.12.1 | v1.12.1 |
| docker.io/grafana/grafana | 13.2.1-distroless | 13.2.2 | 13.2.2 | 13.2.2 |
| ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib | 0.156.0 | 0.161.0 | 0.156.0 | 0.156.0 |
| nvcr.io/nvidia/k8s/dcgm-exporter | 4.6.0-4.8.3-distroless | 4.8.3 | 4.8.3 | 4.6.0-4.8.3-distroless |
| quay.io/brancz/kube-rbac-proxy | v0.18.1 | v0.22.1 | v0.18.1 | v0.18.2 |
| docker.io/grafana/tempo | 2.10.8 | 3.0.3 | 2.10.8 | 2.10.8 |
| docker.io/jellyfin/jellyfin | 10.11.8 | 12.1.0 | 10.11.11 | 10.11.11 |
